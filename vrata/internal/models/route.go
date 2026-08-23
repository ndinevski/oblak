// Package models defines Vrata's core types.
package models

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// RouteKind records what sits behind a route. It is descriptive, not
// behavioural: the proxy treats every kind the same, but the kind lets the
// dashboard and telemetry distinguish traffic to a container from traffic to a
// VM.
type RouteKind string

const (
	// RouteContainer fronts a Brod-managed container, reached on its published
	// host port.
	RouteContainer RouteKind = "container"
	// RouteVM fronts an Izvor virtual machine, reached on its LAN address.
	RouteVM RouteKind = "vm"
	// RouteCustom fronts anything else the operator points it at.
	RouteCustom RouteKind = "custom"
)

// nameRe constrains a route name. It doubles as the path-prefix key, so it must
// be URL-safe, and it appears in span attributes, so it must be low-cardinality
// and readable.
var nameRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,62}$`)

// Route is a single upstream Vrata proxies to.
//
// A request is matched to a route either by its Host header (when Host is set)
// or by a leading path segment equal to the route name. The first makes a web
// app work unmodified at its own hostname; the second needs no DNS and suits an
// API reached under a shared address.
type Route struct {
	// Name is unique and is the path-prefix key (/<name>/...). Lowercase
	// letters, digits and hyphens.
	Name string `json:"name"`

	Kind RouteKind `json:"kind"`

	// Upstream is where matched requests are sent, as scheme://host:port. The
	// path is taken from the incoming request, not from here.
	Upstream string `json:"upstream"`

	// Host, when set, routes any request whose Host header matches it to this
	// route with the path untouched. This is what lets a single-page app whose
	// assets live at /assets/... work behind Vrata.
	Host string `json:"host,omitempty"`

	// StripPrefix removes the leading /<name> before forwarding, so the
	// upstream sees the path it expects. Only applies to path-prefix matches;
	// host matches never strip. Defaults to true.
	StripPrefix bool `json:"strip_prefix"`

	// Target names the Brod container or Izvor VM behind this route, for
	// display. Free text; not used for routing.
	Target string `json:"target,omitempty"`

	// Source records who created the route. A hand-created route is "manual"
	// (or empty, for routes made before this field existed); an auto-discovered
	// one names its discoverer, e.g. "brod". Auto-discovery only ever touches
	// routes it owns, so a manual route is never clobbered or reaped.
	Source RouteSource `json:"source,omitempty"`

	CreatedAt time.Time `json:"created_at"`
}

// RouteSource records the origin of a route.
type RouteSource string

const (
	// SourceManual is a route created through the API by a person.
	SourceManual RouteSource = "manual"
	// SourceBrod is a route created automatically from a Brod container.
	SourceBrod RouteSource = "brod"
)

// CreateRouteRequest is the body of a route-creation call.
type CreateRouteRequest struct {
	Name        string    `json:"name"`
	Kind        RouteKind `json:"kind"`
	Upstream    string    `json:"upstream"`
	Host        string    `json:"host,omitempty"`
	Target      string    `json:"target,omitempty"`
	StripPrefix *bool     `json:"strip_prefix,omitempty"`
}

// Validate checks the request and fills in defaults, returning a ready Route.
func (r *CreateRouteRequest) Validate() (*Route, error) {
	name := strings.ToLower(strings.TrimSpace(r.Name))
	if !nameRe.MatchString(name) {
		return nil, &ValidationError{
			Field:   "name",
			Message: "name must be lowercase letters, digits and hyphens, and start with a letter or digit",
		}
	}

	kind := r.Kind
	if kind == "" {
		kind = RouteCustom
	}
	switch kind {
	case RouteContainer, RouteVM, RouteCustom:
	default:
		return nil, &ValidationError{
			Field:   "kind",
			Message: "kind must be one of: container, vm, custom",
		}
	}

	upstream, err := normalizeUpstream(r.Upstream)
	if err != nil {
		return nil, err
	}

	host := strings.ToLower(strings.TrimSpace(r.Host))
	if host != "" && strings.ContainsAny(host, "/ ") {
		return nil, &ValidationError{Field: "host", Message: "host must be a bare hostname, without a scheme or path"}
	}

	// Default StripPrefix to true: a path-routed upstream almost never expects
	// to see the /<name> segment Vrata used to find it.
	strip := true
	if r.StripPrefix != nil {
		strip = *r.StripPrefix
	}

	return &Route{
		Name:        name,
		Kind:        kind,
		Upstream:    upstream,
		Host:        host,
		StripPrefix: strip,
		Target:      strings.TrimSpace(r.Target),
		Source:      SourceManual,
	}, nil
}

// normalizeUpstream validates and canonicalises an upstream address. A bare
// host:port is accepted and assumed http, since that is the common case for a
// container port or a VM address.
func normalizeUpstream(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", &ValidationError{Field: "upstream", Message: "upstream is required"}
	}
	if !strings.Contains(s, "://") {
		s = "http://" + s
	}

	u, err := url.Parse(s)
	if err != nil {
		return "", &ValidationError{Field: "upstream", Message: "upstream is not a valid URL: " + err.Error()}
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", &ValidationError{Field: "upstream", Message: "upstream scheme must be http or https"}
	}
	if u.Host == "" {
		return "", &ValidationError{Field: "upstream", Message: "upstream must include a host"}
	}
	// Keep only scheme://host[:port]; the request supplies the path.
	return fmt.Sprintf("%s://%s", u.Scheme, u.Host), nil
}
