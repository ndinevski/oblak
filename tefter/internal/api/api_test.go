package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/oblak/tefter/internal/engine"
	"github.com/oblak/tefter/internal/models"
)

// newTestServer builds a server over the in-memory mock, so the whole HTTP
// surface can be exercised without a container runtime or real databases.
func newTestServer() (*Server, *engine.MockProvisioner) {
	p := engine.NewMockProvisioner()
	return NewServerWithProvisioner(Config{Port: "8084"}, p), p
}

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

// createInstance provisions a primary and returns the decoded response.
func createInstance(t *testing.T, srv *Server, name string, dbEngine models.Engine) map[string]interface{} {
	t.Helper()
	rr := do(t, srv, http.MethodPost, "/api/v1/instances",
		map[string]interface{}{"name": name, "engine": string(dbEngine)})
	if rr.Code != http.StatusCreated {
		t.Fatalf("create %s: expected 201, got %d (%s)", name, rr.Code, rr.Body.String())
	}
	return decode(t, rr)
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
}

func TestRespondError(t *testing.T) {
	rr := httptest.NewRecorder()
	respondError(rr, http.StatusBadRequest, "test error")

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", rr.Code)
	}
	var body map[string]string
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}
	if body["error"] != "test error" {
		t.Errorf("expected 'test error', got %s", body["error"])
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
		{"has replicas", models.ErrHasReplicas, http.StatusConflict},
		{"not ready", models.ErrInstanceNotReady, http.StatusConflict},
		{"not supported", models.ErrNotSupported, http.StatusNotImplemented},
		{"runtime unavailable", models.ErrEngineUnavailable, http.StatusServiceUnavailable},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rr := httptest.NewRecorder()
			respondBackendError(rr, tt.err)
			if rr.Code != tt.want {
				t.Errorf("expected %d, got %d", tt.want, rr.Code)
			}
		})
	}
}

// =============================================================================
// Health and catalogue
// =============================================================================

func TestHealthCheckHealthy(t *testing.T) {
	srv, _ := newTestServer()
	rr := do(t, srv, http.MethodGet, "/health", nil)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	if decode(t, rr)["status"] != "healthy" {
		t.Error("expected healthy")
	}
}

func TestHealthCheckDegradedWhenRuntimeDown(t *testing.T) {
	srv, p := newTestServer()
	p.ShouldFail = true

	rr := do(t, srv, http.MethodGet, "/health", nil)
	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", rr.Code)
	}
	if decode(t, rr)["status"] != "degraded" {
		t.Error("expected degraded")
	}
}

func TestListEnginesAndSizes(t *testing.T) {
	srv, _ := newTestServer()

	rr := do(t, srv, http.MethodGet, "/api/v1/engines", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("engines: expected 200, got %d", rr.Code)
	}
	if len(decode(t, rr)["engines"].([]interface{})) == 0 {
		t.Error("expected the engine catalogue to be non-empty")
	}

	rr = do(t, srv, http.MethodGet, "/api/v1/sizes", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("sizes: expected 200, got %d", rr.Code)
	}
	if len(decode(t, rr)["sizes"].([]interface{})) == 0 {
		t.Error("expected the size catalogue to be non-empty")
	}
}

// =============================================================================
// Instances
// =============================================================================

func TestCreateInstanceReturnsGeneratedPasswordOnce(t *testing.T) {
	srv, _ := newTestServer()
	body := createInstance(t, srv, "orders", models.EnginePostgres)

	password, _ := body["password"].(string)
	if len(password) < 16 {
		t.Errorf("expected a generated password, got %q", password)
	}
	if body["note"] == nil {
		t.Error("expected a note saying the password is shown once")
	}

	// It must never be retrievable afterwards: that is the whole point of
	// returning it at creation.
	rr := do(t, srv, http.MethodGet, "/api/v1/instances/orders", nil)
	if bytes.Contains(rr.Body.Bytes(), []byte(password)) {
		t.Error("the password must not be readable from the instance endpoint")
	}
}

// A caller-supplied password is used but not echoed: returning one they
// already know only puts it through another log.
func TestCreateInstanceDoesNotEchoSuppliedPassword(t *testing.T) {
	srv, _ := newTestServer()
	rr := do(t, srv, http.MethodPost, "/api/v1/instances", map[string]interface{}{
		"name": "orders", "engine": "postgres", "password": "supersecret123",
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d (%s)", rr.Code, rr.Body.String())
	}
	if decode(t, rr)["password"] != nil && decode(t, rr)["password"] != "" {
		t.Error("a supplied password must not be echoed back")
	}
	if bytes.Contains(rr.Body.Bytes(), []byte("supersecret123")) {
		t.Error("the supplied password leaked into the response")
	}
}

func TestCreateInstanceValidation(t *testing.T) {
	srv, _ := newTestServer()

	for _, body := range []map[string]interface{}{
		{"name": "", "engine": "postgres"},
		{"name": "orders", "engine": "mongodb"},
		{"name": "orders", "engine": "postgres", "version": "9.6"},
		{"name": "orders", "engine": "postgres", "username": "root"},
	} {
		rr := do(t, srv, http.MethodPost, "/api/v1/instances", body)
		if rr.Code != http.StatusBadRequest {
			t.Errorf("expected 400 for %v, got %d", body, rr.Code)
		}
	}
}

func TestCreateInstanceDuplicate(t *testing.T) {
	srv, _ := newTestServer()
	createInstance(t, srv, "orders", models.EnginePostgres)

	rr := do(t, srv, http.MethodPost, "/api/v1/instances",
		map[string]interface{}{"name": "orders", "engine": "postgres"})
	if rr.Code != http.StatusConflict {
		t.Errorf("expected 409, got %d", rr.Code)
	}
}

func TestGetInstanceIncludesConnectionString(t *testing.T) {
	srv, _ := newTestServer()
	createInstance(t, srv, "orders", models.EngineMySQL)

	rr := do(t, srv, http.MethodGet, "/api/v1/instances/orders", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	conn, _ := decode(t, rr)["connection_string"].(string)
	if conn == "" {
		t.Fatal("expected a connection string")
	}
	// A placeholder rather than the credential, so the string is safe to log.
	if !bytes.Contains([]byte(conn), []byte("<password>")) {
		t.Errorf("expected the password to be a placeholder, got %q", conn)
	}
}

func TestGetInstanceNotFound(t *testing.T) {
	srv, _ := newTestServer()
	rr := do(t, srv, http.MethodGet, "/api/v1/instances/nope", nil)
	if rr.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rr.Code)
	}
}

func TestInstanceLifecycle(t *testing.T) {
	srv, _ := newTestServer()
	createInstance(t, srv, "orders", models.EnginePostgres)

	rr := do(t, srv, http.MethodPost, "/api/v1/instances/orders/stop", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("stop: expected 200, got %d", rr.Code)
	}
	if decode(t, rr)["status"] != string(models.InstanceStatusStopped) {
		t.Error("expected the instance to be stopped")
	}

	rr = do(t, srv, http.MethodPost, "/api/v1/instances/orders/start", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("start: expected 200, got %d", rr.Code)
	}
	if decode(t, rr)["status"] != string(models.InstanceStatusAvailable) {
		t.Error("expected the instance to be available")
	}
}

func TestListInstancesCountsRoles(t *testing.T) {
	srv, _ := newTestServer()
	createInstance(t, srv, "orders", models.EnginePostgres)
	do(t, srv, http.MethodPost, "/api/v1/instances/orders/replicas",
		map[string]interface{}{"name": "orders-ro"})

	rr := do(t, srv, http.MethodGet, "/api/v1/instances", nil)
	body := decode(t, rr)

	if body["count"].(float64) != 2 {
		t.Errorf("expected 2 instances, got %v", body["count"])
	}
	if body["primaries"].(float64) != 1 || body["replicas"].(float64) != 1 {
		t.Errorf("expected 1 primary and 1 replica, got %v", body)
	}
}

// =============================================================================
// Replication
// =============================================================================

func TestCreateReplica(t *testing.T) {
	srv, _ := newTestServer()
	createInstance(t, srv, "orders", models.EnginePostgres)

	rr := do(t, srv, http.MethodPost, "/api/v1/instances/orders/replicas",
		map[string]interface{}{"name": "orders-ro"})
	if rr.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d (%s)", rr.Code, rr.Body.String())
	}

	body := decode(t, rr)
	replica := body["replica"].(map[string]interface{})
	if replica["role"] != string(models.RoleReplica) {
		t.Errorf("expected the new instance to be a replica, got %v", replica["role"])
	}
	if replica["source_instance"] != "orders" {
		t.Errorf("expected it to follow orders, got %v", replica["source_instance"])
	}
	// A replica inherits its primary's engine and credentials rather than
	// getting its own.
	if replica["engine"] != string(models.EnginePostgres) {
		t.Errorf("expected the primary's engine, got %v", replica["engine"])
	}
}

// The source comes from the path; a body naming a different one must not be
// able to redirect the request.
func TestCreateReplicaIgnoresSourceInBody(t *testing.T) {
	srv, _ := newTestServer()
	createInstance(t, srv, "orders", models.EnginePostgres)
	createInstance(t, srv, "other", models.EnginePostgres)

	rr := do(t, srv, http.MethodPost, "/api/v1/instances/orders/replicas",
		map[string]interface{}{"name": "orders-ro", "source_instance": "other"})
	if rr.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d (%s)", rr.Code, rr.Body.String())
	}
	replica := decode(t, rr)["replica"].(map[string]interface{})
	if replica["source_instance"] != "orders" {
		t.Errorf("expected the path to win, got %v", replica["source_instance"])
	}
}

// Chained replication is not managed by Tefter, so it is refused rather than
// silently allowed.
func TestCreateReplicaOfReplicaRejected(t *testing.T) {
	srv, _ := newTestServer()
	createInstance(t, srv, "orders", models.EnginePostgres)
	do(t, srv, http.MethodPost, "/api/v1/instances/orders/replicas",
		map[string]interface{}{"name": "orders-ro"})

	rr := do(t, srv, http.MethodPost, "/api/v1/instances/orders-ro/replicas",
		map[string]interface{}{"name": "orders-ro2"})
	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for a replica of a replica, got %d", rr.Code)
	}
}

func TestCreateReplicaOfStoppedPrimaryRejected(t *testing.T) {
	srv, p := newTestServer()
	createInstance(t, srv, "orders", models.EnginePostgres)
	p.SetInstanceStatus("orders", models.InstanceStatusStopped)

	rr := do(t, srv, http.MethodPost, "/api/v1/instances/orders/replicas",
		map[string]interface{}{"name": "orders-ro"})
	if rr.Code != http.StatusConflict {
		t.Errorf("expected 409 when the primary is not running, got %d", rr.Code)
	}
}

func TestReplicationStatusOnReplica(t *testing.T) {
	srv, _ := newTestServer()
	createInstance(t, srv, "orders", models.EnginePostgres)
	do(t, srv, http.MethodPost, "/api/v1/instances/orders/replicas",
		map[string]interface{}{"name": "orders-ro"})

	rr := do(t, srv, http.MethodGet, "/api/v1/instances/orders-ro/replication", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	body := decode(t, rr)
	if body["state"] != string(models.ReplicationStreaming) {
		t.Errorf("expected a fresh replica to be streaming, got %v", body["state"])
	}
	if body["source_instance"] != "orders" {
		t.Errorf("expected the source to be reported, got %v", body["source_instance"])
	}
}

// Asked of a primary, the endpoint reports its replicas rather than erroring:
// that is almost always what the caller wanted.
func TestReplicationStatusOnPrimary(t *testing.T) {
	srv, _ := newTestServer()
	createInstance(t, srv, "orders", models.EnginePostgres)
	do(t, srv, http.MethodPost, "/api/v1/instances/orders/replicas",
		map[string]interface{}{"name": "orders-ro"})

	rr := do(t, srv, http.MethodGet, "/api/v1/instances/orders/replication", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	body := decode(t, rr)
	if body["role"] != string(models.RolePrimary) {
		t.Errorf("expected the primary role, got %v", body["role"])
	}
	if len(body["replicas"].([]interface{})) != 1 {
		t.Error("expected the primary to list its replica")
	}
}

func TestReplicationStatusReportsLag(t *testing.T) {
	srv, p := newTestServer()
	createInstance(t, srv, "orders", models.EnginePostgres)
	do(t, srv, http.MethodPost, "/api/v1/instances/orders/replicas",
		map[string]interface{}{"name": "orders-ro"})

	lag := 42.5
	p.SetReplicationStatus("orders-ro", &models.ReplicationStatus{
		Instance: "orders-ro", SourceInstance: "orders",
		State: models.ReplicationCatchup, LagSeconds: &lag,
	})

	rr := do(t, srv, http.MethodGet, "/api/v1/instances/orders-ro/replication", nil)
	body := decode(t, rr)

	if body["state"] != string(models.ReplicationCatchup) {
		t.Errorf("expected catching-up, got %v", body["state"])
	}
	if body["lag_seconds"].(float64) != 42.5 {
		t.Errorf("expected the lag to be reported, got %v", body["lag_seconds"])
	}
}

func TestListReplicasIncludesLag(t *testing.T) {
	srv, _ := newTestServer()
	createInstance(t, srv, "orders", models.EnginePostgres)
	do(t, srv, http.MethodPost, "/api/v1/instances/orders/replicas",
		map[string]interface{}{"name": "orders-ro"})

	rr := do(t, srv, http.MethodGet, "/api/v1/instances/orders/replicas", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	body := decode(t, rr)
	replicas := body["replicas"].([]interface{})
	if len(replicas) != 1 {
		t.Fatalf("expected 1 replica, got %d", len(replicas))
	}
	// The lag is included inline so the caller does not have to make a second
	// request per replica.
	if replicas[0].(map[string]interface{})["replication"] == nil {
		t.Error("expected replication status alongside the replica")
	}
}

// Deleting a primary out from under its replicas would orphan them.
func TestDeletePrimaryWithReplicasRejected(t *testing.T) {
	srv, _ := newTestServer()
	createInstance(t, srv, "orders", models.EnginePostgres)
	do(t, srv, http.MethodPost, "/api/v1/instances/orders/replicas",
		map[string]interface{}{"name": "orders-ro"})

	rr := do(t, srv, http.MethodDelete, "/api/v1/instances/orders", nil)
	if rr.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d (%s)", rr.Code, rr.Body.String())
	}

	// Removing the replica first must make the delete succeed.
	do(t, srv, http.MethodDelete, "/api/v1/instances/orders-ro", nil)
	if rr := do(t, srv, http.MethodDelete, "/api/v1/instances/orders", nil); rr.Code != http.StatusOK {
		t.Errorf("expected the delete to succeed once the replica is gone, got %d", rr.Code)
	}
}

func TestPromoteReplica(t *testing.T) {
	srv, _ := newTestServer()
	createInstance(t, srv, "orders", models.EnginePostgres)
	do(t, srv, http.MethodPost, "/api/v1/instances/orders/replicas",
		map[string]interface{}{"name": "orders-ro"})

	rr := do(t, srv, http.MethodPost, "/api/v1/instances/orders-ro/promote", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", rr.Code, rr.Body.String())
	}

	body := decode(t, rr)
	inst := body["instance"].(map[string]interface{})
	// The role must actually change, or the instance would keep reporting
	// itself a replica after promotion.
	if inst["role"] != string(models.RolePrimary) {
		t.Errorf("expected the promoted instance to be a primary, got %v", inst["role"])
	}
	if inst["source_instance"] != nil && inst["source_instance"] != "" {
		t.Errorf("expected the promoted instance to follow nothing, got %v", inst["source_instance"])
	}
	if body["note"] == nil {
		t.Error("expected a note that promotion is one-way")
	}
}

func TestPromotePrimaryRejected(t *testing.T) {
	srv, _ := newTestServer()
	createInstance(t, srv, "orders", models.EnginePostgres)

	rr := do(t, srv, http.MethodPost, "/api/v1/instances/orders/promote", nil)
	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 when promoting a primary, got %d", rr.Code)
	}
}

// =============================================================================
// Backups
// =============================================================================

func TestCreateBackup(t *testing.T) {
	srv, _ := newTestServer()
	createInstance(t, srv, "orders", models.EnginePostgres)

	rr := do(t, srv, http.MethodPost, "/api/v1/instances/orders/backups", nil)
	if rr.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d (%s)", rr.Code, rr.Body.String())
	}

	body := decode(t, rr)
	if body["status"] != string(models.BackupStatusAvailable) {
		t.Errorf("expected the backup to be available, got %v", body["status"])
	}
	if body["type"] != string(models.BackupTypeManual) {
		t.Errorf("expected the type to default to manual, got %v", body["type"])
	}
}

func TestCreateBackupOfStoppedInstanceRejected(t *testing.T) {
	srv, p := newTestServer()
	createInstance(t, srv, "orders", models.EnginePostgres)
	p.SetInstanceStatus("orders", models.InstanceStatusStopped)

	rr := do(t, srv, http.MethodPost, "/api/v1/instances/orders/backups", nil)
	if rr.Code != http.StatusConflict {
		t.Errorf("expected 409 backing up a stopped instance, got %d", rr.Code)
	}
}

// A failed backup still produces a record, so the caller learns why.
func TestCreateBackupFailureReturnsTheRecord(t *testing.T) {
	srv, p := newTestServer()
	createInstance(t, srv, "orders", models.EnginePostgres)
	p.BackupShouldFail = true

	rr := do(t, srv, http.MethodPost, "/api/v1/instances/orders/backups", nil)
	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rr.Code)
	}
	body := decode(t, rr)
	if body["backup"] == nil {
		t.Error("expected the failed backup record to be returned")
	}
	if body["error"] == nil {
		t.Error("expected an error message")
	}
}

func TestListBackupsForInstance(t *testing.T) {
	srv, _ := newTestServer()
	createInstance(t, srv, "orders", models.EnginePostgres)
	createInstance(t, srv, "billing", models.EngineMySQL)

	do(t, srv, http.MethodPost, "/api/v1/instances/orders/backups", nil)
	do(t, srv, http.MethodPost, "/api/v1/instances/orders/backups", nil)
	do(t, srv, http.MethodPost, "/api/v1/instances/billing/backups", nil)

	rr := do(t, srv, http.MethodGet, "/api/v1/instances/orders/backups", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	if decode(t, rr)["count"].(float64) != 2 {
		t.Error("expected only the instance's own backups")
	}

	all := do(t, srv, http.MethodGet, "/api/v1/backups", nil)
	if decode(t, all)["count"].(float64) != 3 {
		t.Error("expected every backup in the global list")
	}
}

// Listing backups of a nonexistent instance is a 404, not an empty list that
// looks like "no backups yet".
func TestListBackupsForUnknownInstance(t *testing.T) {
	srv, _ := newTestServer()
	rr := do(t, srv, http.MethodGet, "/api/v1/instances/nope/backups", nil)
	if rr.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rr.Code)
	}
}

func TestDeleteBackup(t *testing.T) {
	srv, _ := newTestServer()
	createInstance(t, srv, "orders", models.EnginePostgres)
	created := decode(t, do(t, srv, http.MethodPost, "/api/v1/instances/orders/backups", nil))
	id := created["id"].(string)

	if rr := do(t, srv, http.MethodDelete, "/api/v1/backups/"+id, nil); rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	if rr := do(t, srv, http.MethodGet, "/api/v1/backups/"+id, nil); rr.Code != http.StatusNotFound {
		t.Errorf("expected the backup to be gone, got %d", rr.Code)
	}
}

// =============================================================================
// Restore
// =============================================================================

func TestRestoreRequiresConfirmation(t *testing.T) {
	srv, _ := newTestServer()
	createInstance(t, srv, "orders", models.EnginePostgres)
	created := decode(t, do(t, srv, http.MethodPost, "/api/v1/instances/orders/backups", nil))

	rr := do(t, srv, http.MethodPost, "/api/v1/backups/restore",
		map[string]interface{}{"backup_id": created["id"]})
	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 without confirmation, got %d", rr.Code)
	}
}

// The safety backup is the only route back from a wrong restore, so it is
// taken by default.
func TestRestoreTakesAPreRestoreBackup(t *testing.T) {
	srv, _ := newTestServer()
	createInstance(t, srv, "orders", models.EnginePostgres)
	created := decode(t, do(t, srv, http.MethodPost, "/api/v1/instances/orders/backups", nil))

	rr := do(t, srv, http.MethodPost, "/api/v1/backups/restore",
		map[string]interface{}{"backup_id": created["id"], "confirm": true})
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", rr.Code, rr.Body.String())
	}

	body := decode(t, rr)
	if body["restored"] != true {
		t.Error("expected the restore to report success")
	}
	safetyID, _ := body["pre_restore_backup_id"].(string)
	if safetyID == "" {
		t.Fatal("expected a pre-restore backup to have been taken")
	}

	safety := decode(t, do(t, srv, http.MethodGet, "/api/v1/backups/"+safetyID, nil))
	if safety["type"] != string(models.BackupTypePreRestore) {
		t.Errorf("expected the safety backup to be typed pre-restore, got %v", safety["type"])
	}
}

func TestRestoreCanSkipTheSafetyBackup(t *testing.T) {
	srv, _ := newTestServer()
	createInstance(t, srv, "orders", models.EnginePostgres)
	created := decode(t, do(t, srv, http.MethodPost, "/api/v1/instances/orders/backups", nil))

	rr := do(t, srv, http.MethodPost, "/api/v1/backups/restore", map[string]interface{}{
		"backup_id": created["id"], "confirm": true, "skip_pre_restore_backup": true,
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	if id, _ := decode(t, rr)["pre_restore_backup_id"].(string); id != "" {
		t.Error("expected no safety backup when explicitly skipped")
	}
}

// Restoring a Postgres dump into MySQL would fail deep into the load, leaving
// a half-populated database, so it is refused up front.
func TestRestoreAcrossEnginesRejected(t *testing.T) {
	srv, _ := newTestServer()
	createInstance(t, srv, "orders", models.EnginePostgres)
	createInstance(t, srv, "billing", models.EngineMySQL)
	created := decode(t, do(t, srv, http.MethodPost, "/api/v1/instances/orders/backups", nil))

	rr := do(t, srv, http.MethodPost, "/api/v1/backups/restore", map[string]interface{}{
		"backup_id": created["id"], "target_instance": "billing", "confirm": true,
	})
	if rr.Code == http.StatusOK {
		t.Error("expected a cross-engine restore to be refused")
	}
}

// Writing to a replica would diverge it from its primary.
func TestRestoreIntoReplicaRejected(t *testing.T) {
	srv, _ := newTestServer()
	createInstance(t, srv, "orders", models.EnginePostgres)
	do(t, srv, http.MethodPost, "/api/v1/instances/orders/replicas",
		map[string]interface{}{"name": "orders-ro"})
	created := decode(t, do(t, srv, http.MethodPost, "/api/v1/instances/orders/backups", nil))

	rr := do(t, srv, http.MethodPost, "/api/v1/backups/restore", map[string]interface{}{
		"backup_id": created["id"], "target_instance": "orders-ro", "confirm": true,
	})
	if rr.Code == http.StatusOK {
		t.Error("expected restoring into a replica to be refused")
	}
}

// When the restore itself fails, the response must name the way back.
func TestRestoreFailureNamesTheSafetyBackup(t *testing.T) {
	srv, p := newTestServer()
	createInstance(t, srv, "orders", models.EnginePostgres)
	created := decode(t, do(t, srv, http.MethodPost, "/api/v1/instances/orders/backups", nil))
	p.RestoreShouldFail = true

	rr := do(t, srv, http.MethodPost, "/api/v1/backups/restore",
		map[string]interface{}{"backup_id": created["id"], "confirm": true})
	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rr.Code)
	}

	body := decode(t, rr)
	if body["pre_restore_backup_id"] == nil {
		t.Error("expected the failed restore to name the pre-restore backup")
	}
	if body["hint"] == nil {
		t.Error("expected a hint on how to roll back")
	}
}

func TestRestoreUnknownBackup(t *testing.T) {
	srv, _ := newTestServer()
	rr := do(t, srv, http.MethodPost, "/api/v1/backups/restore",
		map[string]interface{}{"backup_id": "nope-20260101-000000", "confirm": true})
	if rr.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rr.Code)
	}
}

// A malformed id must be rejected before it reaches the filesystem.
func TestRestoreRejectsPathTraversalID(t *testing.T) {
	srv, _ := newTestServer()
	rr := do(t, srv, http.MethodPost, "/api/v1/backups/restore",
		map[string]interface{}{"backup_id": "../../etc/passwd", "confirm": true})
	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for a traversal id, got %d", rr.Code)
	}
}

// =============================================================================
// Reused-name backup safety
//
// The scenario a user hit: back up an instance, delete it, then create a new
// instance with the same name. The old backup must not silently attach to the
// new instance, and must not be restorable into it without an explicit opt-in,
// because it would overwrite the new database with unrelated data.
// =============================================================================

func TestBackupsDoNotLeakAcrossReusedName(t *testing.T) {
	srv, _ := newTestServer()
	createInstance(t, srv, "orders", models.EnginePostgres)

	// Back up the first instance.
	rr := do(t, srv, http.MethodPost, "/api/v1/instances/orders/backups",
		map[string]interface{}{"description": "first instance"})
	if rr.Code != http.StatusCreated {
		t.Fatalf("backup: expected 201, got %d (%s)", rr.Code, rr.Body.String())
	}
	oldBackupID := decode(t, rr)["id"].(string)

	// Delete it and create a new instance reusing the name.
	if rr := do(t, srv, http.MethodDelete, "/api/v1/instances/orders", nil); rr.Code != http.StatusOK {
		t.Fatalf("delete: expected 200, got %d", rr.Code)
	}
	createInstance(t, srv, "orders", models.EnginePostgres)

	// The new instance's backup list must not include the old instance's backup.
	rr = do(t, srv, http.MethodGet, "/api/v1/instances/orders/backups", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("list: expected 200, got %d", rr.Code)
	}
	backups := decode(t, rr)["backups"].([]interface{})
	for _, b := range backups {
		if b.(map[string]interface{})["id"] == oldBackupID {
			t.Fatalf("old instance's backup %s leaked into the new instance's list", oldBackupID)
		}
	}
	if len(backups) != 0 {
		t.Errorf("expected the new instance to have no backups, got %d", len(backups))
	}
}

func TestRestoreRefusesBackupFromAReusedName(t *testing.T) {
	srv, _ := newTestServer()
	createInstance(t, srv, "orders", models.EnginePostgres)

	rr := do(t, srv, http.MethodPost, "/api/v1/instances/orders/backups", map[string]interface{}{})
	oldBackupID := decode(t, rr)["id"].(string)

	do(t, srv, http.MethodDelete, "/api/v1/instances/orders", nil)
	createInstance(t, srv, "orders", models.EnginePostgres)

	// Restoring the old backup into the new same-named instance must be refused
	// unless the caller explicitly opts in.
	rr = do(t, srv, http.MethodPost, "/api/v1/backups/restore",
		map[string]interface{}{"backup_id": oldBackupID, "confirm": true})
	if rr.Code != http.StatusConflict {
		t.Fatalf("expected 409 for a cross-identity restore, got %d (%s)", rr.Code, rr.Body.String())
	}

	// With the opt-in, it goes through.
	rr = do(t, srv, http.MethodPost, "/api/v1/backups/restore",
		map[string]interface{}{"backup_id": oldBackupID, "confirm": true, "allow_different_instance": true})
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 with allow_different_instance, got %d (%s)", rr.Code, rr.Body.String())
	}
}

func TestListBackupsFlagsDeletedInstance(t *testing.T) {
	srv, _ := newTestServer()
	createInstance(t, srv, "orders", models.EnginePostgres)
	do(t, srv, http.MethodPost, "/api/v1/instances/orders/backups", map[string]interface{}{})

	// While the instance lives, its backup is not flagged.
	rr := do(t, srv, http.MethodGet, "/api/v1/backups", nil)
	first := decode(t, rr)["backups"].([]interface{})[0].(map[string]interface{})
	if first["from_deleted_instance"] == true {
		t.Error("a backup of a live instance must not be flagged as from a deleted instance")
	}

	// After deletion, the surviving backup is flagged.
	do(t, srv, http.MethodDelete, "/api/v1/instances/orders", nil)
	rr = do(t, srv, http.MethodGet, "/api/v1/backups", nil)
	after := decode(t, rr)["backups"].([]interface{})[0].(map[string]interface{})
	if after["from_deleted_instance"] != true {
		t.Error("a backup of a deleted instance must be flagged")
	}
}

func TestRestoreIntoSameInstanceStillWorks(t *testing.T) {
	// The common case must not regress: restoring a backup into the very
	// instance it came from needs no opt-in.
	srv, _ := newTestServer()
	createInstance(t, srv, "orders", models.EnginePostgres)
	rr := do(t, srv, http.MethodPost, "/api/v1/instances/orders/backups", map[string]interface{}{})
	backupID := decode(t, rr)["id"].(string)

	rr = do(t, srv, http.MethodPost, "/api/v1/backups/restore",
		map[string]interface{}{"backup_id": backupID, "confirm": true})
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 restoring into the same instance, got %d (%s)", rr.Code, rr.Body.String())
	}
}
