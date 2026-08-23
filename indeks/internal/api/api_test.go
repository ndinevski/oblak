package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/oblak/indeks/internal/store"
)

func newTestServer() *Server {
	return NewServerWithStore(Config{Port: "8086"}, store.NewMockStore())
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

func createTable(t *testing.T, s *Server, body map[string]interface{}) {
	t.Helper()
	rr := do(t, s, http.MethodPost, "/api/v1/tables", body)
	if rr.Code != http.StatusCreated {
		t.Fatalf("create table: expected 201, got %d (%s)", rr.Code, rr.Body.String())
	}
}

func TestHealth(t *testing.T) {
	rr := do(t, newTestServer(), http.MethodGet, "/health", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("status %d", rr.Code)
	}
	if decode(t, rr)["service"] != "indeks" {
		t.Error("unexpected health body")
	}
}

func TestCreateTableValidation(t *testing.T) {
	s := newTestServer()
	// missing partition key
	rr := do(t, s, http.MethodPost, "/api/v1/tables", map[string]interface{}{"name": "t"})
	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing partition key, got %d", rr.Code)
	}
	// bad name
	rr = do(t, s, http.MethodPost, "/api/v1/tables", map[string]interface{}{"name": "a", "partition_key": "id"})
	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for a too-short name, got %d", rr.Code)
	}
}

func TestTableLifecycle(t *testing.T) {
	s := newTestServer()
	createTable(t, s, map[string]interface{}{"name": "users", "partition_key": "id"})

	// duplicate -> 409
	rr := do(t, s, http.MethodPost, "/api/v1/tables", map[string]interface{}{"name": "users", "partition_key": "id"})
	if rr.Code != http.StatusConflict {
		t.Errorf("duplicate expected 409, got %d", rr.Code)
	}

	// list
	rr = do(t, s, http.MethodGet, "/api/v1/tables", nil)
	if decode(t, rr)["count"] != float64(1) {
		t.Errorf("expected 1 table")
	}

	// delete + gone
	if rr := do(t, s, http.MethodDelete, "/api/v1/tables/users", nil); rr.Code != http.StatusOK {
		t.Errorf("delete expected 200, got %d", rr.Code)
	}
	if rr := do(t, s, http.MethodGet, "/api/v1/tables/users", nil); rr.Code != http.StatusNotFound {
		t.Errorf("get deleted expected 404, got %d", rr.Code)
	}
}

func TestItemPutGetDeleteViaAPI(t *testing.T) {
	s := newTestServer()
	createTable(t, s, map[string]interface{}{"name": "users", "partition_key": "id"})

	// put
	rr := do(t, s, http.MethodPut, "/api/v1/tables/users/items",
		map[string]interface{}{"item": map[string]interface{}{"id": "u1", "name": "Ada"}})
	if rr.Code != http.StatusOK {
		t.Fatalf("put expected 200, got %d (%s)", rr.Code, rr.Body.String())
	}

	// get
	rr = do(t, s, http.MethodPost, "/api/v1/tables/users/get", map[string]interface{}{"partition_value": "u1"})
	if rr.Code != http.StatusOK {
		t.Fatalf("get expected 200, got %d", rr.Code)
	}
	item := decode(t, rr)["item"].(map[string]interface{})
	if item["name"] != "Ada" {
		t.Errorf("unexpected item %+v", item)
	}

	// get missing -> 404
	rr = do(t, s, http.MethodPost, "/api/v1/tables/users/get", map[string]interface{}{"partition_value": "nope"})
	if rr.Code != http.StatusNotFound {
		t.Errorf("missing get expected 404, got %d", rr.Code)
	}

	// delete
	rr = do(t, s, http.MethodPost, "/api/v1/tables/users/delete", map[string]interface{}{"partition_value": "u1"})
	if rr.Code != http.StatusOK {
		t.Errorf("delete expected 200, got %d", rr.Code)
	}
}

func TestPutRejectsItemMissingKey(t *testing.T) {
	s := newTestServer()
	createTable(t, s, map[string]interface{}{"name": "users", "partition_key": "id"})
	rr := do(t, s, http.MethodPut, "/api/v1/tables/users/items",
		map[string]interface{}{"item": map[string]interface{}{"name": "no key"}})
	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for an item missing the partition key, got %d (%s)", rr.Code, rr.Body.String())
	}
}

func TestQueryViaAPI(t *testing.T) {
	s := newTestServer()
	createTable(t, s, map[string]interface{}{
		"name": "events", "partition_key": "device", "sort_key": "seq", "sort_type": "N",
	})
	for _, seq := range []int{3, 1, 2} {
		do(t, s, http.MethodPut, "/api/v1/tables/events/items",
			map[string]interface{}{"item": map[string]interface{}{"device": "A", "seq": seq}})
	}
	rr := do(t, s, http.MethodPost, "/api/v1/tables/events/query",
		map[string]interface{}{"partition_value": "A"})
	if rr.Code != http.StatusOK {
		t.Fatalf("query expected 200, got %d (%s)", rr.Code, rr.Body.String())
	}
	var res store.QueryResult
	if err := json.Unmarshal(rr.Body.Bytes(), &res); err != nil {
		t.Fatalf("decode result: %v", err)
	}
	if res.Count != 3 {
		t.Fatalf("expected 3 items, got %d", res.Count)
	}
	// ordered by numeric sort key
	if res.Items[0]["seq"].(float64) != 1 || res.Items[2]["seq"].(float64) != 3 {
		t.Errorf("not in sort order: %+v", res.Items)
	}
}

func TestBackupRestoreViaAPI(t *testing.T) {
	s := newTestServer()
	createTable(t, s, map[string]interface{}{"name": "orders", "partition_key": "id"})
	do(t, s, http.MethodPut, "/api/v1/tables/orders/items",
		map[string]interface{}{"item": map[string]interface{}{"id": "o1"}})

	rr := do(t, s, http.MethodPost, "/api/v1/tables/orders/backups", nil)
	if rr.Code != http.StatusCreated {
		t.Fatalf("backup expected 201, got %d (%s)", rr.Code, rr.Body.String())
	}
	id := decode(t, rr)["id"].(string)

	// restore requires confirm
	rr = do(t, s, http.MethodPost, "/api/v1/backups/restore", map[string]interface{}{"backup_id": id})
	if rr.Code != http.StatusBadRequest {
		t.Errorf("unconfirmed restore expected 400, got %d", rr.Code)
	}
	rr = do(t, s, http.MethodPost, "/api/v1/backups/restore",
		map[string]interface{}{"backup_id": id, "confirm": true})
	if rr.Code != http.StatusOK {
		t.Errorf("confirmed restore expected 200, got %d (%s)", rr.Code, rr.Body.String())
	}
}
