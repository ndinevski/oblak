package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/oblak/pristaniste/internal/engine"
	"github.com/oblak/pristaniste/internal/models"
)

// newTestServer builds a server over the in-memory mocks, so the whole HTTP
// surface can be exercised without a Docker daemon or a registry.
func newTestServer() (*Server, *engine.MockEngine, *engine.MockRegistry) {
	eng := engine.NewMockEngine()
	reg := engine.NewMockRegistry()
	srv := NewServerWithBackends(Config{Port: "8083"}, eng, reg)
	return srv, eng, reg
}

// do issues a request against the server and returns the recorder.
func do(t *testing.T, srv *Server, method, path string, body interface{}) *httptest.ResponseRecorder {
	t.Helper()

	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatalf("encode request body: %v", err)
		}
	}

	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	srv.Router().ServeHTTP(rr, req)
	return rr
}

func decode(t *testing.T, rr *httptest.ResponseRecorder) map[string]interface{} {
	t.Helper()
	var out map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode response %q: %v", rr.Body.String(), err)
	}
	return out
}

// =============================================================================
// Response helpers
// =============================================================================

func TestRespondJSON(t *testing.T) {
	rr := httptest.NewRecorder()
	respondJSON(rr, http.StatusOK, map[string]string{"message": "test"})

	if rr.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rr.Code)
	}
	if ct := rr.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("expected Content-Type application/json, got %s", ct)
	}

	var body map[string]string
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}
	if body["message"] != "test" {
		t.Errorf("expected message 'test', got %s", body["message"])
	}
}

func TestRespondError(t *testing.T) {
	rr := httptest.NewRecorder()
	respondError(rr, http.StatusBadRequest, "test error")

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", rr.Code)
	}

	var body map[string]string
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}
	if body["error"] != "test error" {
		t.Errorf("expected error 'test error', got %s", body["error"])
	}
}

// TestRespondBackendErrorMapping pins the error-to-status mapping. A "not
// found" surfacing as a 500 is the failure this guards against.
func TestRespondBackendErrorMapping(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want int
	}{
		{"validation", &models.ValidationError{Field: "name", Message: "required"}, http.StatusBadRequest},
		{"not found", models.ErrNotFound, http.StatusNotFound},
		{"already exists", models.ErrAlreadyExists, http.StatusConflict},
		{"not supported", models.ErrNotSupported, http.StatusNotImplemented},
		{"engine unavailable", models.ErrEngineUnavailable, http.StatusServiceUnavailable},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rr := httptest.NewRecorder()
			respondBackendError(rr, tt.err)
			if rr.Code != tt.want {
				t.Errorf("expected status %d, got %d", tt.want, rr.Code)
			}
		})
	}
}

// =============================================================================
// Health
// =============================================================================

func TestHealthCheckHealthy(t *testing.T) {
	srv, _, _ := newTestServer()
	rr := do(t, srv, http.MethodGet, "/health", nil)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	body := decode(t, rr)
	if body["status"] != "healthy" {
		t.Errorf("expected healthy, got %v", body["status"])
	}
	if body["engine"] != "connected" || body["registry"] != "connected" {
		t.Errorf("expected both backends connected, got %v", body)
	}
}

// A single failing backend must report degraded rather than pretending to be
// healthy, and must say which one.
func TestHealthCheckDegradedWhenEngineDown(t *testing.T) {
	srv, eng, _ := newTestServer()
	eng.ShouldFail = true

	rr := do(t, srv, http.MethodGet, "/health", nil)

	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", rr.Code)
	}
	body := decode(t, rr)
	if body["status"] != "degraded" {
		t.Errorf("expected degraded, got %v", body["status"])
	}
	if body["engine"] != "unavailable" {
		t.Errorf("expected the engine to be reported unavailable, got %v", body["engine"])
	}
	if body["registry"] != "connected" {
		t.Errorf("expected the registry to still be connected, got %v", body["registry"])
	}
}

func TestHealthCheckDegradedWhenRegistryDown(t *testing.T) {
	srv, _, reg := newTestServer()
	reg.ShouldFail = true

	rr := do(t, srv, http.MethodGet, "/health", nil)

	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", rr.Code)
	}
	body := decode(t, rr)
	if body["registry"] != "unavailable" {
		t.Errorf("expected the registry to be reported unavailable, got %v", body["registry"])
	}
	if body["engine"] != "connected" {
		t.Errorf("expected the engine to still be connected, got %v", body["engine"])
	}
}

func TestRegistryInfo(t *testing.T) {
	srv, _, reg := newTestServer()
	rr := do(t, srv, http.MethodGet, "/api/v1/registry", nil)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	body := decode(t, rr)
	if body["host"] != reg.Host() {
		t.Errorf("expected host %q, got %v", reg.Host(), body["host"])
	}
	// The push example is the whole point of the endpoint: it saves the user
	// from having to construct the reference themselves.
	if body["push_example"] == "" {
		t.Error("expected a push example")
	}
}

// =============================================================================
// Repositories
// =============================================================================

func TestListRepositoriesEmpty(t *testing.T) {
	srv, _, _ := newTestServer()
	rr := do(t, srv, http.MethodGet, "/api/v1/repositories", nil)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	body := decode(t, rr)
	if body["count"].(float64) != 0 {
		t.Errorf("expected 0 repositories, got %v", body["count"])
	}
}

func TestListRepositories(t *testing.T) {
	srv, _, reg := newTestServer()
	reg.SeedImage("my-app", "v1", 1024)
	reg.SeedImage("my-app", "v2", 2048)
	reg.SeedImage("other", "latest", 512)

	rr := do(t, srv, http.MethodGet, "/api/v1/repositories", nil)
	body := decode(t, rr)

	if body["count"].(float64) != 2 {
		t.Fatalf("expected 2 repositories, got %v", body["count"])
	}

	repos := body["repositories"].([]interface{})
	first := repos[0].(map[string]interface{})
	if first["name"] != "my-app" {
		t.Errorf("expected repositories sorted by name, got %v first", first["name"])
	}
	if first["image_count"].(float64) != 2 {
		t.Errorf("expected 2 images in my-app, got %v", first["image_count"])
	}
	if first["size_bytes"].(float64) != 3072 {
		t.Errorf("expected the sizes to be summed to 3072, got %v", first["size_bytes"])
	}
}

func TestCreateRepositoryValidatesName(t *testing.T) {
	srv, _, _ := newTestServer()

	rr := do(t, srv, http.MethodPost, "/api/v1/repositories",
		map[string]string{"name": "Invalid Name"})

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for an invalid name, got %d", rr.Code)
	}
}

func TestCreateRepositoryReturnsPushTarget(t *testing.T) {
	srv, _, reg := newTestServer()

	rr := do(t, srv, http.MethodPost, "/api/v1/repositories",
		map[string]string{"name": "my-app"})

	if rr.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d (%s)", rr.Code, rr.Body.String())
	}

	body := decode(t, rr)
	repo := body["repository"].(map[string]interface{})
	if repo["uri"] != reg.Host()+"/my-app" {
		t.Errorf("expected the push URI to be rendered, got %v", repo["uri"])
	}
	// The repository does not exist in the registry until something is pushed,
	// and the response must not claim otherwise.
	if repo["exists"].(bool) {
		t.Error("expected a declared-but-unpushed repository to report exists=false")
	}
	if body["next_step"] == nil {
		t.Error("expected a next_step telling the user how to push")
	}
}

func TestCreateRepositoryConflictsWithExisting(t *testing.T) {
	srv, _, reg := newTestServer()
	reg.SeedImage("my-app", "v1", 1024)

	rr := do(t, srv, http.MethodPost, "/api/v1/repositories",
		map[string]string{"name": "my-app"})

	if rr.Code != http.StatusConflict {
		t.Errorf("expected 409 for a repository that already holds images, got %d", rr.Code)
	}
}

func TestGetRepositoryNotFound(t *testing.T) {
	srv, _, _ := newTestServer()
	rr := do(t, srv, http.MethodGet, "/api/v1/repositories/nope", nil)

	if rr.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rr.Code)
	}
}

// A repository name may contain slashes, so the route must match the whole
// path rather than stopping at the first separator.
func TestGetRepositoryWithPathName(t *testing.T) {
	srv, _, reg := newTestServer()
	reg.SeedImage("team/my-app", "v1", 1024)

	rr := do(t, srv, http.MethodGet, "/api/v1/repositories/team/my-app", nil)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 for a namespaced repository, got %d", rr.Code)
	}
	body := decode(t, rr)
	if body["name"] != "team/my-app" {
		t.Errorf("expected name team/my-app, got %v", body["name"])
	}
}

func TestDeleteRepository(t *testing.T) {
	srv, _, reg := newTestServer()
	reg.SeedImage("my-app", "v1", 1024)

	rr := do(t, srv, http.MethodDelete, "/api/v1/repositories/my-app", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", rr.Code, rr.Body.String())
	}

	// The response must not overstate what happened: the registry only
	// reclaims disk on garbage collection.
	body := decode(t, rr)
	if body["note"] == nil {
		t.Error("expected a note about garbage collection")
	}

	after := do(t, srv, http.MethodGet, "/api/v1/repositories/my-app", nil)
	if after.Code != http.StatusNotFound {
		t.Errorf("expected the repository to be gone, got %d", after.Code)
	}
}

// A registry started without delete support must produce a clear 501 rather
// than a generic failure.
func TestDeleteImageOnRegistryWithoutDeleteSupport(t *testing.T) {
	srv, _, reg := newTestServer()
	reg.SeedImage("my-app", "v1", 1024)
	reg.DeleteDisabled = true

	rr := do(t, srv, http.MethodDelete, "/api/v1/repositories/my-app/images/v1", nil)

	if rr.Code != http.StatusNotImplemented {
		t.Errorf("expected 501 when deletion is disabled, got %d", rr.Code)
	}
}

// =============================================================================
// Images
// =============================================================================

func TestListImages(t *testing.T) {
	srv, _, reg := newTestServer()
	reg.SeedImage("my-app", "v1", 1000)
	reg.SeedImage("my-app", "v2", 2000)

	rr := do(t, srv, http.MethodGet, "/api/v1/repositories/my-app/images", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	body := decode(t, rr)
	if body["count"].(float64) != 2 {
		t.Errorf("expected 2 images, got %v", body["count"])
	}
	if body["total_size"].(float64) != 3000 {
		t.Errorf("expected total_size 3000, got %v", body["total_size"])
	}
}

func TestGetImage(t *testing.T) {
	srv, _, reg := newTestServer()
	reg.SeedImage("my-app", "v1", 1024)

	rr := do(t, srv, http.MethodGet, "/api/v1/repositories/my-app/images/v1", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	body := decode(t, rr)
	// A pullable reference is more useful to the caller than the raw fields.
	if body["reference"] != reg.Host()+"/my-app:v1" {
		t.Errorf("expected a pullable reference, got %v", body["reference"])
	}
}

func TestGetImageNotFound(t *testing.T) {
	srv, _, reg := newTestServer()
	reg.SeedImage("my-app", "v1", 1024)

	rr := do(t, srv, http.MethodGet, "/api/v1/repositories/my-app/images/nope", nil)
	if rr.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rr.Code)
	}
}

func TestDeleteImage(t *testing.T) {
	srv, _, reg := newTestServer()
	reg.SeedImage("my-app", "v1", 1024)
	reg.SeedImage("my-app", "v2", 1024)

	rr := do(t, srv, http.MethodDelete, "/api/v1/repositories/my-app/images/v1", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", rr.Code, rr.Body.String())
	}

	remaining := do(t, srv, http.MethodGet, "/api/v1/repositories/my-app/images", nil)
	if decode(t, remaining)["count"].(float64) != 1 {
		t.Error("expected one image to remain")
	}
}

// =============================================================================
// Containers
// =============================================================================

func TestListContainersEmpty(t *testing.T) {
	srv, _, _ := newTestServer()
	rr := do(t, srv, http.MethodGet, "/api/v1/containers", nil)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	if decode(t, rr)["count"].(float64) != 0 {
		t.Error("expected no containers")
	}
}

func TestCreateContainer(t *testing.T) {
	srv, eng, _ := newTestServer()

	rr := do(t, srv, http.MethodPost, "/api/v1/containers", map[string]interface{}{
		"name":  "web",
		"image": "nginx:alpine",
		"ports": []map[string]interface{}{{"container_port": 80, "host_port": 8080}},
	})

	if rr.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d (%s)", rr.Code, rr.Body.String())
	}

	body := decode(t, rr)
	if body["name"] != "web" {
		t.Errorf("expected name web, got %v", body["name"])
	}
	// Creating without an explicit start should leave it running.
	if body["status"] != string(models.ContainerStatusRunning) {
		t.Errorf("expected the container to be running, got %v", body["status"])
	}

	// The image has to be pulled or the container could not have started.
	if len(eng.PulledImages()) == 0 {
		t.Error("expected the image to have been pulled")
	}
}

func TestCreateContainerWithoutStarting(t *testing.T) {
	srv, _, _ := newTestServer()

	rr := do(t, srv, http.MethodPost, "/api/v1/containers", map[string]interface{}{
		"name":  "web",
		"image": "nginx:alpine",
		"start": false,
	})

	if rr.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", rr.Code)
	}
	if decode(t, rr)["status"] != string(models.ContainerStatusPending) {
		t.Error("expected start=false to leave the container unstarted")
	}
}

func TestCreateContainerValidationFailure(t *testing.T) {
	srv, _, _ := newTestServer()

	rr := do(t, srv, http.MethodPost, "/api/v1/containers", map[string]interface{}{
		"name":  "",
		"image": "nginx",
	})

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}

func TestCreateContainerDuplicateName(t *testing.T) {
	srv, _, _ := newTestServer()
	payload := map[string]interface{}{"name": "web", "image": "nginx"}

	do(t, srv, http.MethodPost, "/api/v1/containers", payload)
	rr := do(t, srv, http.MethodPost, "/api/v1/containers", payload)

	if rr.Code != http.StatusConflict {
		t.Errorf("expected 409 for a duplicate name, got %d", rr.Code)
	}
}

func TestCreateContainerMalformedBody(t *testing.T) {
	srv, _, _ := newTestServer()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/containers", bytes.NewBufferString("{not json"))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	srv.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for malformed JSON, got %d", rr.Code)
	}
}

func TestContainerLifecycle(t *testing.T) {
	srv, _, _ := newTestServer()
	do(t, srv, http.MethodPost, "/api/v1/containers",
		map[string]interface{}{"name": "web", "image": "nginx"})

	// Stop
	rr := do(t, srv, http.MethodPost, "/api/v1/containers/web/stop", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("stop: expected 200, got %d (%s)", rr.Code, rr.Body.String())
	}
	// The action returns the resulting state, so the caller need not poll.
	if decode(t, rr)["status"] != string(models.ContainerStatusExited) {
		t.Error("expected the container to be exited after a stop")
	}

	// Start
	rr = do(t, srv, http.MethodPost, "/api/v1/containers/web/start", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("start: expected 200, got %d", rr.Code)
	}
	if decode(t, rr)["status"] != string(models.ContainerStatusRunning) {
		t.Error("expected the container to be running after a start")
	}

	// Restart
	rr = do(t, srv, http.MethodPost, "/api/v1/containers/web/restart", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("restart: expected 200, got %d", rr.Code)
	}
	if decode(t, rr)["status"] != string(models.ContainerStatusRunning) {
		t.Error("expected the container to be running after a restart")
	}
}

// A lifecycle action is commonly called with no body, which must not be an
// error.
func TestStopContainerWithoutBody(t *testing.T) {
	srv, _, _ := newTestServer()
	do(t, srv, http.MethodPost, "/api/v1/containers",
		map[string]interface{}{"name": "web", "image": "nginx"})

	req := httptest.NewRequest(http.MethodPost, "/api/v1/containers/web/stop", nil)
	rr := httptest.NewRecorder()
	srv.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200 with no body, got %d (%s)", rr.Code, rr.Body.String())
	}
}

func TestStopContainerRejectsBadTimeout(t *testing.T) {
	srv, _, _ := newTestServer()
	do(t, srv, http.MethodPost, "/api/v1/containers",
		map[string]interface{}{"name": "web", "image": "nginx"})

	rr := do(t, srv, http.MethodPost, "/api/v1/containers/web/stop",
		map[string]interface{}{"timeout_seconds": -5})

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for a negative timeout, got %d", rr.Code)
	}
}

// Deleting a running container without force must be refused, so a delete
// cannot silently kill a live workload.
func TestDeleteRunningContainerRequiresForce(t *testing.T) {
	srv, _, _ := newTestServer()
	do(t, srv, http.MethodPost, "/api/v1/containers",
		map[string]interface{}{"name": "web", "image": "nginx"})

	rr := do(t, srv, http.MethodDelete, "/api/v1/containers/web", nil)
	if rr.Code == http.StatusOK {
		t.Error("expected deleting a running container without force to fail")
	}

	forced := do(t, srv, http.MethodDelete, "/api/v1/containers/web?force=true", nil)
	if forced.Code != http.StatusOK {
		t.Errorf("expected a forced delete to succeed, got %d (%s)", forced.Code, forced.Body.String())
	}
}

func TestGetContainerNotFound(t *testing.T) {
	srv, _, _ := newTestServer()
	rr := do(t, srv, http.MethodGet, "/api/v1/containers/nope", nil)

	if rr.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rr.Code)
	}
}

func TestListContainersFiltersStoppedByDefault(t *testing.T) {
	srv, _, _ := newTestServer()
	do(t, srv, http.MethodPost, "/api/v1/containers",
		map[string]interface{}{"name": "running-one", "image": "nginx"})
	do(t, srv, http.MethodPost, "/api/v1/containers",
		map[string]interface{}{"name": "stopped-one", "image": "nginx", "start": false})

	// Default matches `docker ps`: running only.
	rr := do(t, srv, http.MethodGet, "/api/v1/containers", nil)
	if got := decode(t, rr)["count"].(float64); got != 1 {
		t.Errorf("expected 1 running container by default, got %v", got)
	}

	all := do(t, srv, http.MethodGet, "/api/v1/containers?all=true", nil)
	body := decode(t, all)
	if got := body["count"].(float64); got != 2 {
		t.Errorf("expected 2 containers with all=true, got %v", got)
	}
	if got := body["running"].(float64); got != 1 {
		t.Errorf("expected the running count to stay 1, got %v", got)
	}
}

func TestContainerLogs(t *testing.T) {
	srv, eng, _ := newTestServer()
	rr := do(t, srv, http.MethodPost, "/api/v1/containers",
		map[string]interface{}{"name": "web", "image": "nginx"})
	id := decode(t, rr)["id"].(string)

	eng.SeedLogs(id,
		models.LogEntry{Stream: "stdout", Message: "first"},
		models.LogEntry{Stream: "stderr", Message: "second"},
	)

	logs := do(t, srv, http.MethodGet, "/api/v1/containers/web/logs", nil)
	if logs.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", logs.Code)
	}
	if decode(t, logs)["count"].(float64) != 2 {
		t.Error("expected 2 log entries")
	}
}

func TestContainerLogsTailIsCapped(t *testing.T) {
	srv, _, _ := newTestServer()
	do(t, srv, http.MethodPost, "/api/v1/containers",
		map[string]interface{}{"name": "web", "image": "nginx"})

	// An absurd tail must not be passed through to the engine unbounded.
	rr := do(t, srv, http.MethodGet, "/api/v1/containers/web/logs?tail=999999", nil)
	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}
}

func TestContainerStats(t *testing.T) {
	srv, eng, _ := newTestServer()
	rr := do(t, srv, http.MethodPost, "/api/v1/containers",
		map[string]interface{}{"name": "web", "image": "nginx"})
	id := decode(t, rr)["id"].(string)

	eng.SeedStats(id, &models.ContainerStats{ContainerID: id, CPUPercent: 12.5, MemoryUsage: 1024})

	stats := do(t, srv, http.MethodGet, "/api/v1/containers/web/stats", nil)
	if stats.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", stats.Code)
	}
	if decode(t, stats)["cpu_percent"].(float64) != 12.5 {
		t.Error("expected the seeded CPU sample to be returned")
	}
}

// A failure to pull must surface as an error rather than a half-created
// container.
func TestCreateContainerPullFailure(t *testing.T) {
	srv, eng, _ := newTestServer()
	eng.PullShouldFail = true

	rr := do(t, srv, http.MethodPost, "/api/v1/containers",
		map[string]interface{}{"name": "web", "image": "nope:v1"})

	if rr.Code == http.StatusCreated {
		t.Fatal("expected creation to fail when the image cannot be pulled")
	}

	list := do(t, srv, http.MethodGet, "/api/v1/containers?all=true", nil)
	if decode(t, list)["count"].(float64) != 0 {
		t.Error("expected no container to be left behind after a failed pull")
	}
}

// An unreachable engine must be a 503, not a 500: the request was fine.
func TestEngineUnavailableSurfacesAsServiceUnavailable(t *testing.T) {
	srv, eng, _ := newTestServer()
	eng.ShouldFail = true
	eng.FailMessage = models.ErrEngineUnavailable.Error()

	rr := do(t, srv, http.MethodGet, "/api/v1/containers", nil)
	if rr.Code != http.StatusInternalServerError && rr.Code != http.StatusServiceUnavailable {
		t.Errorf("expected a 5xx when the engine is down, got %d", rr.Code)
	}
}
