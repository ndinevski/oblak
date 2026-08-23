package telemetry

import "testing"

func TestNormalizeSpanName(t *testing.T) {
	cases := []struct{ in, want string }{
		// The dominant case: container inspect, named by raw id.
		{"GET /v1.51/containers/2f3c9d1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c/json",
			"GET /containers/{id}/json"},
		// A human-readable container name is just as volatile as a hex id.
		{"GET /v1.51/containers/tefter-orders/json", "GET /containers/{id}/json"},
		// Lifecycle actions.
		{"POST /v1.51/containers/deadbeefcafe1234/start", "POST /containers/{id}/start"},
		{"POST /v1.51/containers/deadbeefcafe1234/stop", "POST /containers/{id}/stop"},
		// Images and volumes collapse the same way.
		{"GET /v1.51/images/postgres:16-alpine/json", "GET /images/{id}/json"},
		// List and create endpoints must NOT be treated as ids.
		{"GET /v1.51/containers/json", "GET /containers/json"},
		{"POST /v1.51/containers/create", "POST /containers/create"},
		{"GET /v1.51/images/json", "GET /images/json"},
		// A bare trailing id with no action.
		{"GET /v1.51/exec/abcdef123456", "GET /exec/{id}"},
		// The version prefix is dropped even without an id.
		{"GET /v1.51/info", "GET /info"},
		{"GET /v1.51/_ping", "GET /_ping"},
		// The services' own server spans are already clean and must be
		// untouched, including the {name} placeholder that looks id-like.
		{"GET /api/v1/instances/{name}", "GET /api/v1/instances/{name}"},
		{"POST /api/v1/instances/{name}/backups", "POST /api/v1/instances/{name}/backups"},
		{"GET /api/v1/backups/{id}", "GET /api/v1/backups/{id}"},
		// A non-HTTP span name passes through.
		{"pg_basebackup", "pg_basebackup"},
	}

	for _, c := range cases {
		if got := normalizeSpanName(c.in); got != c.want {
			t.Errorf("normalizeSpanName(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

// A name normalized once must not change again: the batcher may re-read it, and
// an unstable name would defeat grouping.
func TestNormalizeSpanNameIsIdempotent(t *testing.T) {
	for _, in := range []string{
		"GET /v1.51/containers/abc123def456/json",
		"GET /api/v1/instances/{name}",
	} {
		once := normalizeSpanName(in)
		twice := normalizeSpanName(once)
		if once != twice {
			t.Errorf("normalizeSpanName not idempotent for %q: %q -> %q", in, once, twice)
		}
	}
}
