package discovery

import (
	"testing"

	"github.com/oblak/vrata/internal/models"
)

func containerWith(name, status string, ports ...[2]int) brodContainer {
	c := brodContainer{Name: name, Status: status}
	for _, p := range ports {
		c.Ports = append(c.Ports, struct {
			ContainerPort int    `json:"container_port"`
			HostPort      int    `json:"host_port"`
			Protocol      string `json:"protocol"`
		}{ContainerPort: p[0], HostPort: p[1], Protocol: "tcp"})
	}
	return c
}

func TestDesiredRoutesSinglePort(t *testing.T) {
	got := desiredRoutes([]brodContainer{
		containerWith("webapp", "running", [2]int{80, 8080}),
	}, "host.docker.internal")

	if len(got) != 1 {
		t.Fatalf("expected 1 route, got %d", len(got))
	}
	r := got[0]
	if r.Name != "webapp" {
		t.Errorf("name = %q, want webapp", r.Name)
	}
	if r.Upstream != "http://host.docker.internal:8080" {
		t.Errorf("upstream = %q", r.Upstream)
	}
	if r.Source != models.SourceBrod {
		t.Errorf("source = %q, want brod", r.Source)
	}
	if r.Target != "webapp" {
		t.Errorf("target = %q, want webapp", r.Target)
	}
	if !r.StripPrefix {
		t.Error("expected strip_prefix true for a path route")
	}
}

func TestDesiredRoutesMultiPortGetsSuffix(t *testing.T) {
	got := desiredRoutes([]brodContainer{
		containerWith("api", "running", [2]int{80, 8080}, [2]int{9090, 9090}),
	}, "localhost")

	if len(got) != 2 {
		t.Fatalf("expected 2 routes for a two-port container, got %d", len(got))
	}
	names := map[string]bool{got[0].Name: true, got[1].Name: true}
	if !names["api-80"] || !names["api-9090"] {
		t.Errorf("expected api-80 and api-9090, got %v", names)
	}
}

func TestDesiredRoutesSkipsStoppedAndPortless(t *testing.T) {
	got := desiredRoutes([]brodContainer{
		containerWith("stopped-app", "exited", [2]int{80, 8080}),
		containerWith("no-ports", "running"),
	}, "localhost")

	if len(got) != 0 {
		t.Fatalf("expected no routes (one stopped, one portless), got %d: %+v", len(got), got)
	}
}

func TestDesiredRoutesSkipsUnpublishedAndUDP(t *testing.T) {
	c := brodContainer{Name: "svc", Status: "running"}
	c.Ports = append(c.Ports,
		struct {
			ContainerPort int    `json:"container_port"`
			HostPort      int    `json:"host_port"`
			Protocol      string `json:"protocol"`
		}{ContainerPort: 53, HostPort: 53, Protocol: "udp"},
		struct {
			ContainerPort int    `json:"container_port"`
			HostPort      int    `json:"host_port"`
			Protocol      string `json:"protocol"`
		}{ContainerPort: 8080, HostPort: 0, Protocol: "tcp"}, // not published
	)
	got := desiredRoutes([]brodContainer{c}, "localhost")
	if len(got) != 0 {
		t.Errorf("expected no routes (udp + unpublished), got %d", len(got))
	}
}

func TestSanitizeName(t *testing.T) {
	cases := map[string]string{
		"webapp":    "webapp",
		"Team_App":  "team-app",
		"my.app.v1": "my-app-v1",
		"--edge--":  "edge",
		"UPPER":     "upper",
	}
	for in, want := range cases {
		if got := sanitizeName(in); got != want {
			t.Errorf("sanitizeName(%q) = %q, want %q", in, got, want)
		}
	}
}
