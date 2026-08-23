// Package discovery keeps Vrata's route table in step with the workloads other
// Oblak services run, so their traffic is observable without anyone registering
// a route by hand.
//
// The only discoverable workloads today are Brod containers: they have a
// managed HTTP endpoint (a published port) and a stable name. It polls Brod's
// own API rather than reaching into Docker, which keeps Vrata decoupled and
// dependency-light, and reuses Brod's managed-container view. Izvor VMs are not
// auto-discovered: a VM's address alone does not say whether it serves HTTP or
// on what port, so a blind route would just produce dead 502s. VMs are routed
// manually.
package discovery

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/oblak/vrata/internal/models"
	"github.com/oblak/vrata/internal/routes"
)

// BrodDiscoverer polls Brod and reconciles a route per running container that
// publishes a port.
type BrodDiscoverer struct {
	table    *routes.Table
	logger   *slog.Logger
	brodURL  string
	interval time.Duration
	// workloadHost is the address Vrata uses to reach a container's published
	// port. From inside a container that is host.docker.internal; on the host
	// it is localhost.
	workloadHost string
	http         *http.Client
}

// New builds a discoverer. interval is clamped to a sane floor.
func New(table *routes.Table, logger *slog.Logger, brodURL, workloadHost string, interval time.Duration) *BrodDiscoverer {
	if interval < 5*time.Second {
		interval = 30 * time.Second
	}
	if workloadHost == "" {
		workloadHost = "host.docker.internal"
	}
	return &BrodDiscoverer{
		table:        table,
		logger:       logger,
		brodURL:      strings.TrimRight(brodURL, "/"),
		interval:     interval,
		workloadHost: workloadHost,
		http:         &http.Client{Timeout: 10 * time.Second},
	}
}

// Run reconciles immediately, then on every tick, until the context is
// cancelled. Blocking; call it in its own goroutine.
func (d *BrodDiscoverer) Run(ctx context.Context) {
	d.reconcileOnce(ctx)

	ticker := time.NewTicker(d.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			d.reconcileOnce(ctx)
		}
	}
}

func (d *BrodDiscoverer) reconcileOnce(ctx context.Context) {
	containers, err := d.fetchContainers(ctx)
	if err != nil {
		// Brod being down is not fatal: keep the routes already discovered
		// rather than tearing them all down because one poll failed.
		d.logger.Warn("vrata discovery: could not reach Brod", "error", err, "brod_url", d.brodURL)
		return
	}

	desired := desiredRoutes(containers, d.workloadHost)
	added, updated, removed := d.table.Reconcile(models.SourceBrod, desired)
	if added+updated+removed > 0 {
		d.logger.Info("vrata discovery: reconciled Brod routes",
			"added", added, "updated", updated, "removed", removed, "containers", len(containers))
	}
}

// brodContainer is the subset of Brod's container JSON that discovery needs.
type brodContainer struct {
	Name   string `json:"name"`
	Status string `json:"status"`
	Ports  []struct {
		ContainerPort int    `json:"container_port"`
		HostPort      int    `json:"host_port"`
		Protocol      string `json:"protocol"`
	} `json:"ports"`
}

func (d *BrodDiscoverer) fetchContainers(ctx context.Context) ([]brodContainer, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, d.brodURL+"/api/v1/containers?all=false", nil)
	if err != nil {
		return nil, err
	}
	resp, err := d.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("brod returned %d", resp.StatusCode)
	}
	var body struct {
		Containers []brodContainer `json:"containers"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, err
	}
	return body.Containers, nil
}

var routeNameRe = regexp.MustCompile(`[^a-z0-9-]+`)

// desiredRoutes computes the auto-routes for a set of Brod containers.
//
// A running container with at least one published TCP port gets a path-routed
// entry named after the container (so /<container>/... reaches it). A container
// that publishes more than one port gets one route per port, suffixed with the
// container port, since a single name cannot address several ports.
func desiredRoutes(containers []brodContainer, workloadHost string) []*models.Route {
	var out []*models.Route
	for _, c := range containers {
		if !isRunning(c.Status) {
			continue
		}
		published := publishedTCPPorts(c)
		if len(published) == 0 {
			continue
		}
		base := sanitizeName(c.Name)
		if base == "" {
			continue
		}
		multi := len(published) > 1
		for _, p := range published {
			name := base
			if multi {
				name = fmt.Sprintf("%s-%d", base, p.ContainerPort)
			}
			out = append(out, &models.Route{
				Name:        name,
				Kind:        models.RouteContainer,
				Upstream:    fmt.Sprintf("http://%s:%d", workloadHost, p.HostPort),
				StripPrefix: true,
				Target:      c.Name,
				Source:      models.SourceBrod,
			})
		}
	}
	return out
}

type port struct {
	ContainerPort int
	HostPort      int
}

func publishedTCPPorts(c brodContainer) []port {
	var out []port
	for _, p := range c.Ports {
		if p.HostPort <= 0 {
			continue
		}
		if p.Protocol != "" && strings.ToLower(p.Protocol) != "tcp" {
			continue
		}
		out = append(out, port{ContainerPort: p.ContainerPort, HostPort: p.HostPort})
	}
	return out
}

func isRunning(status string) bool {
	s := strings.ToLower(status)
	return s == "running" || s == "restarting"
}

// sanitizeName turns a container name into a valid route name (lowercase,
// digits, hyphens), so a container called "Team_App" becomes "team-app".
func sanitizeName(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	s = routeNameRe.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if len(s) > 63 {
		s = strings.Trim(s[:63], "-")
	}
	return s
}
