package routes

import (
	"path/filepath"
	"testing"

	"github.com/oblak/vrata/internal/models"
)

func mustAdd(t *testing.T, tbl *Table, r *models.Route) {
	t.Helper()
	if err := tbl.Add(r); err != nil {
		t.Fatalf("add %s: %v", r.Name, err)
	}
}

func newTable(t *testing.T) *Table {
	t.Helper()
	tbl, err := New("")
	if err != nil {
		t.Fatalf("new table: %v", err)
	}
	return tbl
}

func TestMatchByPathPrefixStripsName(t *testing.T) {
	tbl := newTable(t)
	mustAdd(t, tbl, &models.Route{Name: "api", Upstream: "http://10.0.0.5:8080", StripPrefix: true})

	route, fwd, ok := tbl.Match("", "/api/users/42")
	if !ok {
		t.Fatal("expected a match")
	}
	if route.Name != "api" {
		t.Errorf("matched %s, want api", route.Name)
	}
	// The /api segment is Vrata's routing key; the upstream must not see it.
	if fwd != "/users/42" {
		t.Errorf("forward path = %q, want /users/42", fwd)
	}
}

func TestMatchByPathPrefixKeepsNameWhenNotStripping(t *testing.T) {
	tbl := newTable(t)
	mustAdd(t, tbl, &models.Route{Name: "app", Upstream: "http://10.0.0.5:80", StripPrefix: false})

	_, fwd, ok := tbl.Match("", "/app/assets/main.js")
	if !ok {
		t.Fatal("expected a match")
	}
	if fwd != "/app/assets/main.js" {
		t.Errorf("forward path = %q, want the path unchanged", fwd)
	}
}

func TestMatchByHostKeepsPath(t *testing.T) {
	tbl := newTable(t)
	// A host route must forward the path untouched, so a web app's absolute
	// asset paths (/assets/...) still resolve.
	mustAdd(t, tbl, &models.Route{Name: "shop", Host: "shop.oblak.lan", Upstream: "http://10.0.0.9:80"})

	route, fwd, ok := tbl.Match("shop.oblak.lan", "/assets/app.css")
	if !ok {
		t.Fatal("expected a host match")
	}
	if route.Name != "shop" {
		t.Errorf("matched %s, want shop", route.Name)
	}
	if fwd != "/assets/app.css" {
		t.Errorf("forward path = %q, want it unchanged", fwd)
	}
}

func TestMatchHostIgnoresPort(t *testing.T) {
	tbl := newTable(t)
	mustAdd(t, tbl, &models.Route{Name: "shop", Host: "shop.oblak.lan", Upstream: "http://10.0.0.9:80"})

	if _, _, ok := tbl.Match("shop.oblak.lan:8090", "/"); !ok {
		t.Error("a Host header with a port must still match")
	}
}

func TestHostMatchWinsOverPath(t *testing.T) {
	tbl := newTable(t)
	mustAdd(t, tbl, &models.Route{Name: "byhost", Host: "a.oblak.lan", Upstream: "http://10.0.0.1:80"})
	mustAdd(t, tbl, &models.Route{Name: "a", Upstream: "http://10.0.0.2:80", StripPrefix: true})

	// The request path starts with /a (the path route), but the Host header
	// names the host route. The explicit host wins.
	route, fwd, ok := tbl.Match("a.oblak.lan", "/a/thing")
	if !ok {
		t.Fatal("expected a match")
	}
	if route.Name != "byhost" {
		t.Errorf("matched %s, want byhost (host match wins)", route.Name)
	}
	if fwd != "/a/thing" {
		t.Errorf("forward path = %q, want it unchanged for a host match", fwd)
	}
}

func TestMatchExactPrefixOnly(t *testing.T) {
	tbl := newTable(t)
	mustAdd(t, tbl, &models.Route{Name: "app", Upstream: "http://10.0.0.5:80", StripPrefix: true})

	// A route named "app" must not swallow "/application", which is a different
	// first segment.
	if _, _, ok := tbl.Match("", "/application/x"); ok {
		t.Error("/application must not match the route named app")
	}
	// The bare name with no trailing path is a valid match (forwarded as /).
	_, fwd, ok := tbl.Match("", "/app")
	if !ok {
		t.Fatal("expected /app to match")
	}
	if fwd != "/" {
		t.Errorf("forward path = %q, want /", fwd)
	}
}

func TestNoMatch(t *testing.T) {
	tbl := newTable(t)
	mustAdd(t, tbl, &models.Route{Name: "api", Upstream: "http://10.0.0.5:80", StripPrefix: true})
	if _, _, ok := tbl.Match("", "/nope/x"); ok {
		t.Error("an unknown first segment must not match")
	}
	if _, _, ok := tbl.Match("", "/"); ok {
		t.Error("the root path must not match when no route claims it")
	}
}

func TestAddRejectsDuplicateNameAndHost(t *testing.T) {
	tbl := newTable(t)
	mustAdd(t, tbl, &models.Route{Name: "a", Host: "a.lan", Upstream: "http://10.0.0.1:80"})

	if err := tbl.Add(&models.Route{Name: "a", Upstream: "http://10.0.0.2:80"}); err == nil {
		t.Error("a duplicate name must be refused")
	}
	if err := tbl.Add(&models.Route{Name: "b", Host: "a.lan", Upstream: "http://10.0.0.3:80"}); err == nil {
		t.Error("a host already routed elsewhere must be refused")
	}
}

// Routes must survive a restart, or every deploy would silently drop the
// gateway's whole configuration.
func TestPersistenceRoundTrip(t *testing.T) {
	file := filepath.Join(t.TempDir(), "routes.json")

	tbl, err := New(file)
	if err != nil {
		t.Fatalf("new: %v", err)
	}
	mustAdd(t, tbl, &models.Route{Name: "api", Kind: models.RouteContainer, Upstream: "http://10.0.0.5:8080", StripPrefix: true})
	mustAdd(t, tbl, &models.Route{Name: "shop", Kind: models.RouteVM, Host: "shop.lan", Upstream: "http://192.168.1.50:80"})

	// Re-open from the same file: the routes must come back and still match.
	reopened, err := New(file)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	if got := len(reopened.List()); got != 2 {
		t.Fatalf("expected 2 routes after reload, got %d", got)
	}
	if _, _, ok := reopened.Match("shop.lan", "/"); !ok {
		t.Error("host route did not survive reload")
	}
	if _, fwd, ok := reopened.Match("", "/api/v1/x"); !ok || fwd != "/v1/x" {
		t.Errorf("path route did not survive reload: ok=%v fwd=%q", ok, fwd)
	}
}

func TestDelete(t *testing.T) {
	tbl := newTable(t)
	mustAdd(t, tbl, &models.Route{Name: "a", Host: "a.lan", Upstream: "http://10.0.0.1:80"})
	if err := tbl.Delete("a"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, _, ok := tbl.Match("a.lan", "/"); ok {
		t.Error("a deleted route must stop matching, including by host")
	}
	if err := tbl.Delete("a"); err == nil {
		t.Error("deleting a missing route must error")
	}
}

func TestReconcileAddsUpdatesAndRemoves(t *testing.T) {
	tbl := newTable(t)

	// Round 1: two discovered routes.
	a, u, r := tbl.Reconcile(models.SourcePristaniste, []*models.Route{
		{Name: "app1", Kind: models.RouteContainer, Upstream: "http://h:8001", StripPrefix: true},
		{Name: "app2", Kind: models.RouteContainer, Upstream: "http://h:8002", StripPrefix: true},
	})
	if a != 2 || u != 0 || r != 0 {
		t.Fatalf("round 1: added=%d updated=%d removed=%d, want 2/0/0", a, u, r)
	}

	// Round 2: app1's upstream changed, app2 gone, app3 new.
	a, u, r = tbl.Reconcile(models.SourcePristaniste, []*models.Route{
		{Name: "app1", Kind: models.RouteContainer, Upstream: "http://h:9999", StripPrefix: true},
		{Name: "app3", Kind: models.RouteContainer, Upstream: "http://h:8003", StripPrefix: true},
	})
	if a != 1 || u != 1 || r != 1 {
		t.Fatalf("round 2: added=%d updated=%d removed=%d, want 1/1/1", a, u, r)
	}
	if got, _ := tbl.Get("app1"); got.Upstream != "http://h:9999" {
		t.Errorf("app1 upstream not updated: %q", got.Upstream)
	}
	if _, err := tbl.Get("app2"); err == nil {
		t.Error("app2 should have been removed")
	}
}

func TestReconcileNeverTouchesManualRoutes(t *testing.T) {
	tbl := newTable(t)
	// A manual route the operator created.
	mustAdd(t, tbl, &models.Route{Name: "keepme", Kind: models.RouteCustom, Upstream: "http://manual:80", Source: models.SourceManual})

	// Discovery wants a route with the SAME name (a container also called keepme).
	tbl.Reconcile(models.SourcePristaniste, []*models.Route{
		{Name: "keepme", Kind: models.RouteContainer, Upstream: "http://discovered:80"},
	})
	got, _ := tbl.Get("keepme")
	if got.Upstream != "http://manual:80" || got.Source != models.SourceManual {
		t.Errorf("manual route was clobbered: %+v", got)
	}

	// A later empty reconcile (container gone) must not remove the manual route.
	tbl.Reconcile(models.SourcePristaniste, nil)
	if _, err := tbl.Get("keepme"); err != nil {
		t.Error("manual route was reaped by reconcile")
	}
}

func TestReconcileIdempotent(t *testing.T) {
	tbl := newTable(t)
	desired := []*models.Route{
		{Name: "app", Kind: models.RouteContainer, Upstream: "http://h:80", StripPrefix: true},
	}
	tbl.Reconcile(models.SourcePristaniste, desired)
	a, u, r := tbl.Reconcile(models.SourcePristaniste, desired)
	if a != 0 || u != 0 || r != 0 {
		t.Errorf("second identical reconcile should be a no-op, got %d/%d/%d", a, u, r)
	}
}
