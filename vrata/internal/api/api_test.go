package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/oblak/vrata/internal/routes"
)

func newTestServer(t *testing.T) *Server {
	t.Helper()
	tbl, err := routes.New("") // in-memory
	if err != nil {
		t.Fatalf("table: %v", err)
	}
	return NewServer(Config{Port: "8085", ProxyPort: "8090"}, tbl)
}

func do(t *testing.T, s *Server, method, path string, body interface{}) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	s.Router().ServeHTTP(rr, req)
	return rr
}

func decode(t *testing.T, rr *httptest.ResponseRecorder) map[string]interface{} {
	t.Helper()
	var out map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode %q: %v", rr.Body.String(), err)
	}
	return out
}

func TestHealth(t *testing.T) {
	rr := do(t, newTestServer(t), http.MethodGet, "/health", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	body := decode(t, rr)
	if body["service"] != "vrata" || body["status"] != "healthy" {
		t.Errorf("unexpected health body: %v", body)
	}
	if body["proxy_port"] != "8090" {
		t.Errorf("health should report the proxy port, got %v", body["proxy_port"])
	}
}

func TestCreateAndListRoute(t *testing.T) {
	s := newTestServer(t)

	rr := do(t, s, http.MethodPost, "/api/v1/routes", map[string]interface{}{
		"name": "web", "kind": "container", "upstream": "http://host.docker.internal:80",
		"host": "web.oblak.lan", "target": "my-container",
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("create status = %d, want 201 (%s)", rr.Code, rr.Body.String())
	}
	route := decode(t, rr)["route"].(map[string]interface{})
	if route["upstream"] != "http://host.docker.internal:80" {
		t.Errorf("unexpected upstream: %v", route["upstream"])
	}
	if route["created_at"] == "0001-01-01T00:00:00Z" || route["created_at"] == nil {
		t.Errorf("created_at should be stamped, got %v", route["created_at"])
	}

	rr = do(t, s, http.MethodGet, "/api/v1/routes", nil)
	if n := decode(t, rr)["count"]; n != float64(1) {
		t.Errorf("count = %v, want 1", n)
	}
}

func TestCreateRouteValidation(t *testing.T) {
	s := newTestServer(t)
	// Missing upstream is a 400 with a field-scoped message.
	rr := do(t, s, http.MethodPost, "/api/v1/routes", map[string]interface{}{"name": "web"})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rr.Code)
	}
	if msg, _ := decode(t, rr)["error"].(string); msg == "" {
		t.Error("expected an error message")
	}
}

func TestCreateDuplicateRouteConflicts(t *testing.T) {
	s := newTestServer(t)
	body := map[string]interface{}{"name": "web", "upstream": "http://x:80"}
	if rr := do(t, s, http.MethodPost, "/api/v1/routes", body); rr.Code != http.StatusCreated {
		t.Fatalf("first create: %d", rr.Code)
	}
	rr := do(t, s, http.MethodPost, "/api/v1/routes", body)
	if rr.Code != http.StatusConflict {
		t.Errorf("duplicate create status = %d, want 409", rr.Code)
	}
}

func TestGetAndDeleteRoute(t *testing.T) {
	s := newTestServer(t)
	do(t, s, http.MethodPost, "/api/v1/routes", map[string]interface{}{"name": "web", "upstream": "http://x:80"})

	if rr := do(t, s, http.MethodGet, "/api/v1/routes/web", nil); rr.Code != http.StatusOK {
		t.Errorf("get status = %d, want 200", rr.Code)
	}
	if rr := do(t, s, http.MethodGet, "/api/v1/routes/missing", nil); rr.Code != http.StatusNotFound {
		t.Errorf("get missing status = %d, want 404", rr.Code)
	}
	if rr := do(t, s, http.MethodDelete, "/api/v1/routes/web", nil); rr.Code != http.StatusOK {
		t.Errorf("delete status = %d, want 200", rr.Code)
	}
	if rr := do(t, s, http.MethodGet, "/api/v1/routes/web", nil); rr.Code != http.StatusNotFound {
		t.Errorf("route should be gone after delete, got %d", rr.Code)
	}
}
