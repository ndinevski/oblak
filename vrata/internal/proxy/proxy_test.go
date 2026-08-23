package proxy

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/oblak/vrata/internal/models"
	"github.com/oblak/vrata/internal/routes"
)

// newHandler wires a handler over a table with no logger or metrics, so the
// proxy behaviour can be tested without a telemetry backend.
func newHandler(t *testing.T, rs ...*models.Route) *Handler {
	t.Helper()
	tbl, err := routes.New("")
	if err != nil {
		t.Fatalf("table: %v", err)
	}
	for _, r := range rs {
		if err := tbl.Add(r); err != nil {
			t.Fatalf("add %s: %v", r.Name, err)
		}
	}
	return NewHandler(tbl, nil, nil)
}

func TestProxyForwardsAndStripsPrefix(t *testing.T) {
	// The upstream records the path it actually received.
	var gotPath string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("X-Upstream", "yes")
		_, _ = io.WriteString(w, "hello from upstream")
	}))
	defer upstream.Close()

	h := newHandler(t, &models.Route{
		Name: "api", Kind: models.RouteContainer, Upstream: upstream.URL, StripPrefix: true,
	})

	req := httptest.NewRequest(http.MethodGet, "/api/users/42", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	if gotPath != "/users/42" {
		t.Errorf("upstream saw path %q, want /users/42 (prefix stripped)", gotPath)
	}
	if !strings.Contains(rr.Body.String(), "hello from upstream") {
		t.Errorf("body not proxied: %q", rr.Body.String())
	}
	if rr.Header().Get("X-Upstream") != "yes" {
		t.Error("upstream response headers not passed through")
	}
}

func TestProxyHostRouteKeepsPath(t *testing.T) {
	var gotPath string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	h := newHandler(t, &models.Route{
		Name: "shop", Kind: models.RouteVM, Host: "shop.oblak.lan", Upstream: upstream.URL,
	})

	req := httptest.NewRequest(http.MethodGet, "/assets/app.css", nil)
	req.Host = "shop.oblak.lan"
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	if gotPath != "/assets/app.css" {
		t.Errorf("upstream saw %q, want the path unchanged for a host route", gotPath)
	}
}

func TestProxySetsForwardedHeaders(t *testing.T) {
	var gotXFF, gotXFH string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotXFF = r.Header.Get("X-Forwarded-For")
		gotXFH = r.Header.Get("X-Forwarded-Host")
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	h := newHandler(t, &models.Route{Name: "api", Upstream: upstream.URL, StripPrefix: true})
	req := httptest.NewRequest(http.MethodGet, "/api/", nil)
	req.RemoteAddr = "203.0.113.9:5555"
	req.Host = "gw.oblak.lan"
	h.ServeHTTP(httptest.NewRecorder(), req)

	if gotXFF != "203.0.113.9" {
		t.Errorf("X-Forwarded-For = %q, want 203.0.113.9", gotXFF)
	}
	if gotXFH != "gw.oblak.lan" {
		t.Errorf("X-Forwarded-Host = %q, want gw.oblak.lan", gotXFH)
	}
}

func TestProxyUnmatchedIs404(t *testing.T) {
	h := newHandler(t, &models.Route{Name: "api", Upstream: "http://127.0.0.1:1", StripPrefix: true})
	req := httptest.NewRequest(http.MethodGet, "/unknown/thing", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404 for an unmatched route", rr.Code)
	}
}

func TestProxyDeadUpstreamIs502(t *testing.T) {
	// Port 1 is not listening, so the upstream is unreachable.
	h := newHandler(t, &models.Route{Name: "api", Upstream: "http://127.0.0.1:1", StripPrefix: true})
	req := httptest.NewRequest(http.MethodGet, "/api/x", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadGateway {
		t.Errorf("status = %d, want 502 for a dead upstream", rr.Code)
	}
}

func TestProxyPreservesMethodAndBody(t *testing.T) {
	var gotMethod, gotBody string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		w.WriteHeader(http.StatusCreated)
	}))
	defer upstream.Close()

	h := newHandler(t, &models.Route{Name: "api", Upstream: upstream.URL, StripPrefix: true})
	req := httptest.NewRequest(http.MethodPost, "/api/things", strings.NewReader(`{"x":1}`))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Errorf("status = %d, want 201", rr.Code)
	}
	if gotMethod != http.MethodPost {
		t.Errorf("method = %q, want POST", gotMethod)
	}
	if gotBody != `{"x":1}` {
		t.Errorf("body = %q, want the JSON forwarded", gotBody)
	}
}
