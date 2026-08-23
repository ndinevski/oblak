// Package routes holds Vrata's route table: the set of upstreams it proxies to,
// how a request is matched to one, and how the set survives a restart.
package routes

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"github.com/oblak/vrata/internal/models"
)

// Table is the in-memory route set, indexed for both matching strategies, and
// backed by a JSON file so routes outlive a restart.
type Table struct {
	mu     sync.RWMutex
	byName map[string]*models.Route
	byHost map[string]*models.Route
	path   string // persistence file; empty disables persistence
}

// New returns a table persisted to path. If the file exists it is loaded, so
// routes registered before a restart come back. An empty path keeps the table
// in memory only (used in tests).
func New(path string) (*Table, error) {
	t := &Table{
		byName: make(map[string]*models.Route),
		byHost: make(map[string]*models.Route),
		path:   path,
	}
	if path != "" {
		if err := t.load(); err != nil {
			return nil, err
		}
	}
	return t, nil
}

// Add inserts a route, refusing to shadow an existing name or host so a
// mistaken registration cannot silently steal another route's traffic.
func (t *Table) Add(r *models.Route) error {
	t.mu.Lock()
	defer t.mu.Unlock()

	if _, exists := t.byName[r.Name]; exists {
		return fmt.Errorf("%w: route %s", models.ErrAlreadyExists, r.Name)
	}
	if r.Host != "" {
		if other, exists := t.byHost[r.Host]; exists {
			return fmt.Errorf("%w: host %s is already routed to %s", models.ErrAlreadyExists, r.Host, other.Name)
		}
	}

	t.byName[r.Name] = r
	if r.Host != "" {
		t.byHost[r.Host] = r
	}
	return t.persist()
}

// Get returns one route by name.
func (t *Table) Get(name string) (*models.Route, error) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	r, ok := t.byName[name]
	if !ok {
		return nil, fmt.Errorf("%w: route %s", models.ErrNotFound, name)
	}
	copied := *r
	return &copied, nil
}

// Delete removes a route by name.
func (t *Table) Delete(name string) error {
	t.mu.Lock()
	defer t.mu.Unlock()
	r, ok := t.byName[name]
	if !ok {
		return fmt.Errorf("%w: route %s", models.ErrNotFound, name)
	}
	delete(t.byName, name)
	if r.Host != "" {
		delete(t.byHost, r.Host)
	}
	return t.persist()
}

// Reconcile makes the routes owned by one source exactly match desired.
//
// This is how auto-discovery keeps the route table in step with the world: a
// discoverer (e.g. the Pristaniste poller) computes the routes that should exist for
// the containers it can see and calls Reconcile with them. Routes of that
// source not in the desired set are removed (their container is gone); new
// ones are added; changed ones are updated in place.
//
// Crucially, it only ever touches routes whose Source matches: a manually
// created route is never clobbered or reaped, even if a discovered route wants
// the same name (the manual route wins and the discovered one is skipped).
// Returns the number of routes added, updated and removed.
func (t *Table) Reconcile(source models.RouteSource, desired []*models.Route) (added, updated, removed int) {
	t.mu.Lock()
	defer t.mu.Unlock()

	desiredByName := make(map[string]*models.Route, len(desired))
	for _, r := range desired {
		desiredByName[r.Name] = r
	}

	// Remove routes of this source that are no longer wanted.
	for name, existing := range t.byName {
		if existing.Source != source {
			continue
		}
		if _, want := desiredByName[name]; !want {
			delete(t.byName, name)
			if existing.Host != "" {
				delete(t.byHost, existing.Host)
			}
			removed++
		}
	}

	// Add or update the wanted routes.
	for _, want := range desired {
		want.Source = source
		existing, present := t.byName[want.Name]
		if present {
			// A name owned by a different source (a manual route) is left
			// alone: an operator's route always wins over a discovered one.
			if existing.Source != source {
				continue
			}
			if routesEqual(existing, want) {
				continue
			}
			if existing.Host != "" {
				delete(t.byHost, existing.Host)
			}
			t.byName[want.Name] = want
			if want.Host != "" {
				t.byHost[want.Host] = want
			}
			updated++
			continue
		}
		// A host claimed by another route cannot be taken.
		if want.Host != "" {
			if _, taken := t.byHost[want.Host]; taken {
				continue
			}
		}
		t.byName[want.Name] = want
		if want.Host != "" {
			t.byHost[want.Host] = want
		}
		added++
	}

	if added+updated+removed > 0 {
		_ = t.persist()
	}
	return added, updated, removed
}

// routesEqual reports whether two routes are the same for reconciliation
// purposes. CreatedAt is deliberately ignored so a re-discovered route that is
// otherwise identical is not counted as a change.
func routesEqual(a, b *models.Route) bool {
	return a.Kind == b.Kind &&
		a.Upstream == b.Upstream &&
		a.Host == b.Host &&
		a.StripPrefix == b.StripPrefix &&
		a.Target == b.Target
}

// List returns all routes, sorted by name for a stable display order.
func (t *Table) List() []models.Route {
	t.mu.RLock()
	defer t.mu.RUnlock()
	out := make([]models.Route, 0, len(t.byName))
	for _, r := range t.byName {
		out = append(out, *r)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// Match resolves a request to a route and the path to forward upstream.
//
// A Host header match wins over a path match: it is the more specific signal
// (the client asked for that name explicitly), and it forwards the path
// untouched, which is what a web app needs. A path match falls back to the
// leading segment, optionally stripping it.
//
// The returned forwardPath always begins with "/".
func (t *Table) Match(host, path string) (route *models.Route, forwardPath string, ok bool) {
	t.mu.RLock()
	defer t.mu.RUnlock()

	if h := normalizeHost(host); h != "" {
		if r, found := t.byHost[h]; found {
			return r, ensureLeadingSlash(path), true
		}
	}

	// Path routing: the first segment is the route name.
	name, rest := splitFirstSegment(path)
	if name == "" {
		return nil, "", false
	}
	r, found := t.byName[name]
	if !found {
		return nil, "", false
	}
	if r.StripPrefix {
		return r, ensureLeadingSlash(rest), true
	}
	return r, ensureLeadingSlash(path), true
}

// load reads the persisted routes. A missing file is not an error: it just
// means nothing has been registered yet.
func (t *Table) load() error {
	data, err := os.ReadFile(t.path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("read route file: %w", err)
	}
	var stored []models.Route
	if err := json.Unmarshal(data, &stored); err != nil {
		return fmt.Errorf("parse route file: %w", err)
	}
	for i := range stored {
		r := stored[i]
		t.byName[r.Name] = &r
		if r.Host != "" {
			t.byHost[r.Host] = &r
		}
	}
	return nil
}

// persist writes the whole table atomically. Callers already hold the lock.
func (t *Table) persist() error {
	if t.path == "" {
		return nil
	}
	out := make([]models.Route, 0, len(t.byName))
	for _, r := range t.byName {
		out = append(out, *r)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })

	data, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return fmt.Errorf("encode routes: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(t.path), 0o750); err != nil {
		return fmt.Errorf("create route dir: %w", err)
	}
	// Write-then-rename so a crash mid-write cannot truncate the route file.
	tmp := t.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o640); err != nil {
		return fmt.Errorf("write route file: %w", err)
	}
	if err := os.Rename(tmp, t.path); err != nil {
		return fmt.Errorf("replace route file: %w", err)
	}
	return nil
}

func normalizeHost(host string) string {
	h := strings.ToLower(strings.TrimSpace(host))
	// Drop any port: routing is by name, not by the port the client hit.
	if i := strings.LastIndexByte(h, ':'); i >= 0 {
		// Guard against IPv6 literals like [::1]; only trim a trailing :port.
		if !strings.Contains(h[i:], "]") {
			h = h[:i]
		}
	}
	return h
}

func splitFirstSegment(path string) (first, rest string) {
	p := strings.TrimPrefix(path, "/")
	if p == "" {
		return "", ""
	}
	if i := strings.IndexByte(p, '/'); i >= 0 {
		return p[:i], p[i:]
	}
	return p, ""
}

func ensureLeadingSlash(p string) string {
	if p == "" {
		return "/"
	}
	if p[0] != '/' {
		return "/" + p
	}
	return p
}
