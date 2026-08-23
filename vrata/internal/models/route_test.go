package models

import "testing"

func TestCreateRouteRequestValidate(t *testing.T) {
	boolPtr := func(b bool) *bool { return &b }

	tests := []struct {
		name    string
		req     CreateRouteRequest
		wantErr bool
		field   string
		check   func(*testing.T, *Route)
	}{
		{
			name: "minimal container route",
			req:  CreateRouteRequest{Name: "web", Kind: RouteContainer, Upstream: "http://localhost:80"},
			check: func(t *testing.T, r *Route) {
				if !r.StripPrefix {
					t.Error("strip_prefix should default to true")
				}
			},
		},
		{
			name: "bare host:port upstream is assumed http",
			req:  CreateRouteRequest{Name: "vm1", Kind: RouteVM, Upstream: "192.168.1.50:8080"},
			check: func(t *testing.T, r *Route) {
				if r.Upstream != "http://192.168.1.50:8080" {
					t.Errorf("upstream = %q, want http://192.168.1.50:8080", r.Upstream)
				}
			},
		},
		{
			name: "kind defaults to custom",
			req:  CreateRouteRequest{Name: "x", Upstream: "http://localhost:9000"},
			check: func(t *testing.T, r *Route) {
				if r.Kind != RouteCustom {
					t.Errorf("kind = %q, want custom", r.Kind)
				}
			},
		},
		{
			name: "strip_prefix can be turned off",
			req:  CreateRouteRequest{Name: "spa", Upstream: "http://localhost:80", StripPrefix: boolPtr(false)},
			check: func(t *testing.T, r *Route) {
				if r.StripPrefix {
					t.Error("strip_prefix should be false when set false")
				}
			},
		},
		{
			name: "upstream path is dropped",
			req:  CreateRouteRequest{Name: "x", Upstream: "http://localhost:80/ignored/path"},
			check: func(t *testing.T, r *Route) {
				if r.Upstream != "http://localhost:80" {
					t.Errorf("upstream = %q, want the path stripped", r.Upstream)
				}
			},
		},
		{
			name: "name is lowercased",
			req:  CreateRouteRequest{Name: "  WebApp  ", Upstream: "http://localhost:80"},
			check: func(t *testing.T, r *Route) {
				if r.Name != "webapp" {
					t.Errorf("name = %q, want webapp", r.Name)
				}
			},
		},

		{name: "empty name", req: CreateRouteRequest{Upstream: "http://x:80"}, wantErr: true, field: "name"},
		{name: "name with slash", req: CreateRouteRequest{Name: "a/b", Upstream: "http://x:80"}, wantErr: true, field: "name"},
		{name: "name with underscore", req: CreateRouteRequest{Name: "a_b", Upstream: "http://x:80"}, wantErr: true, field: "name"},
		{name: "empty upstream", req: CreateRouteRequest{Name: "a"}, wantErr: true, field: "upstream"},
		{name: "upstream bad scheme", req: CreateRouteRequest{Name: "a", Upstream: "ftp://x:21"}, wantErr: true, field: "upstream"},
		{name: "unknown kind", req: CreateRouteRequest{Name: "a", Kind: "database", Upstream: "http://x:80"}, wantErr: true, field: "kind"},
		{name: "host with scheme", req: CreateRouteRequest{Name: "a", Upstream: "http://x:80", Host: "http://x"}, wantErr: true, field: "host"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			route, err := tt.req.Validate()
			if tt.wantErr {
				if err == nil {
					t.Fatal("expected an error, got none")
				}
				if ve, ok := err.(*ValidationError); ok && ve.Field != tt.field {
					t.Errorf("field = %q, want %q", ve.Field, tt.field)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tt.check != nil {
				tt.check(t, route)
			}
		})
	}
}
