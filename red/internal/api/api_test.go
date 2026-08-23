package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/oblak/red/internal/store"
)

func newTestServer() *Server {
	return NewServerWithStore(Config{Port: "8087"}, store.NewMockStore())
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

func mkQueue(t *testing.T, s *Server, body map[string]interface{}) {
	t.Helper()
	rr := do(t, s, http.MethodPost, "/api/v1/queues", body)
	if rr.Code != http.StatusCreated {
		t.Fatalf("create queue: expected 201, got %d (%s)", rr.Code, rr.Body.String())
	}
}

func TestHealth(t *testing.T) {
	rr := do(t, newTestServer(), http.MethodGet, "/health", nil)
	if rr.Code != http.StatusOK || decode(t, rr)["service"] != "red" {
		t.Fatalf("unexpected health: %d %s", rr.Code, rr.Body.String())
	}
}

func TestQueueValidation(t *testing.T) {
	s := newTestServer()
	// max_receive_count without a DLQ is rejected.
	rr := do(t, s, http.MethodPost, "/api/v1/queues", map[string]interface{}{"name": "j", "max_receive_count": 3})
	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for max_receive_count without DLQ, got %d", rr.Code)
	}
}

func TestQueueLifecycle(t *testing.T) {
	s := newTestServer()
	mkQueue(t, s, map[string]interface{}{"name": "jobs"})
	rr := do(t, s, http.MethodPost, "/api/v1/queues", map[string]interface{}{"name": "jobs"})
	if rr.Code != http.StatusConflict {
		t.Errorf("duplicate queue expected 409, got %d", rr.Code)
	}
	rr = do(t, s, http.MethodGet, "/api/v1/queues", nil)
	if decode(t, rr)["count"] != float64(1) {
		t.Errorf("expected 1 queue")
	}
	if rr := do(t, s, http.MethodDelete, "/api/v1/queues/jobs", nil); rr.Code != http.StatusOK {
		t.Errorf("delete expected 200, got %d", rr.Code)
	}
}

func TestSendReceiveDeleteViaAPI(t *testing.T) {
	s := newTestServer()
	mkQueue(t, s, map[string]interface{}{"name": "jobs"})

	rr := do(t, s, http.MethodPost, "/api/v1/queues/jobs/messages", map[string]interface{}{"body": "hello"})
	if rr.Code != http.StatusCreated {
		t.Fatalf("send expected 201, got %d (%s)", rr.Code, rr.Body.String())
	}

	rr = do(t, s, http.MethodPost, "/api/v1/queues/jobs/messages/receive", map[string]interface{}{"max_messages": 5})
	if rr.Code != http.StatusOK {
		t.Fatalf("receive expected 200, got %d", rr.Code)
	}
	body := decode(t, rr)
	msgs := body["messages"].([]interface{})
	if len(msgs) != 1 {
		t.Fatalf("expected 1 message, got %d", len(msgs))
	}
	m := msgs[0].(map[string]interface{})
	if m["body"] != "hello" {
		t.Errorf("unexpected body %v", m["body"])
	}
	handle, _ := m["receipt_handle"].(string)
	if handle == "" {
		t.Fatal("missing receipt handle")
	}

	// A second receive returns nothing (in-flight).
	rr = do(t, s, http.MethodPost, "/api/v1/queues/jobs/messages/receive", nil)
	if len(decode(t, rr)["messages"].([]interface{})) != 0 {
		t.Error("in-flight message should not be redelivered immediately")
	}

	// Delete by handle.
	rr = do(t, s, http.MethodPost, "/api/v1/queues/jobs/messages/delete", map[string]interface{}{"receipt_handle": handle})
	if rr.Code != http.StatusOK {
		t.Errorf("delete expected 200, got %d (%s)", rr.Code, rr.Body.String())
	}
	// Stale delete -> 404.
	rr = do(t, s, http.MethodPost, "/api/v1/queues/jobs/messages/delete", map[string]interface{}{"receipt_handle": handle})
	if rr.Code != http.StatusNotFound {
		t.Errorf("stale delete expected 404, got %d", rr.Code)
	}
}

func TestSendValidation(t *testing.T) {
	s := newTestServer()
	mkQueue(t, s, map[string]interface{}{"name": "jobs"})
	rr := do(t, s, http.MethodPost, "/api/v1/queues/jobs/messages", map[string]interface{}{})
	if rr.Code != http.StatusBadRequest {
		t.Errorf("empty body expected 400, got %d", rr.Code)
	}
}

func TestStatsAndPurge(t *testing.T) {
	s := newTestServer()
	mkQueue(t, s, map[string]interface{}{"name": "jobs"})
	do(t, s, http.MethodPost, "/api/v1/queues/jobs/messages", map[string]interface{}{"body": "a"})
	do(t, s, http.MethodPost, "/api/v1/queues/jobs/messages", map[string]interface{}{"body": "b"})

	rr := do(t, s, http.MethodGet, "/api/v1/queues/jobs/stats", nil)
	if decode(t, rr)["visible_messages"] != float64(2) {
		t.Errorf("expected 2 visible, got %v", decode(t, rr)["visible_messages"])
	}
	rr = do(t, s, http.MethodPost, "/api/v1/queues/jobs/purge", nil)
	if decode(t, rr)["purged"] != float64(2) {
		t.Errorf("expected purge 2, got %v", decode(t, rr)["purged"])
	}
}

func TestBackupRestoreViaAPI(t *testing.T) {
	s := newTestServer()
	mkQueue(t, s, map[string]interface{}{"name": "jobs"})
	do(t, s, http.MethodPost, "/api/v1/queues/jobs/messages", map[string]interface{}{"body": "x"})

	rr := do(t, s, http.MethodPost, "/api/v1/queues/jobs/backups", nil)
	if rr.Code != http.StatusCreated {
		t.Fatalf("backup expected 201, got %d", rr.Code)
	}
	id := decode(t, rr)["id"].(string)

	rr = do(t, s, http.MethodPost, "/api/v1/backups/restore", map[string]interface{}{"backup_id": id})
	if rr.Code != http.StatusBadRequest {
		t.Errorf("unconfirmed restore expected 400, got %d", rr.Code)
	}
	rr = do(t, s, http.MethodPost, "/api/v1/backups/restore", map[string]interface{}{"backup_id": id, "confirm": true})
	if rr.Code != http.StatusOK {
		t.Errorf("confirmed restore expected 200, got %d (%s)", rr.Code, rr.Body.String())
	}
}
