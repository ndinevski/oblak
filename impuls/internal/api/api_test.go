package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/oblak/impuls/internal/function"
	"github.com/oblak/impuls/internal/models"
	"github.com/oblak/impuls/internal/storage"
)

// mockStorage implements storage.Storage interface for testing
type mockStorage struct {
	functions map[string]*models.Function
	code      map[string][]byte
}

func newMockStorage() *mockStorage {
	return &mockStorage{
		functions: make(map[string]*models.Function),
		code:      make(map[string][]byte),
	}
}

func (m *mockStorage) Create(fn *models.Function) error {
	if _, exists := m.functions[fn.Name]; exists {
		return storage.ErrAlreadyExists
	}
	m.functions[fn.Name] = fn
	return nil
}

func (m *mockStorage) Get(name string) (*models.Function, error) {
	fn, ok := m.functions[name]
	if !ok {
		return nil, storage.ErrNotFound
	}
	return fn, nil
}

func (m *mockStorage) GetByID(id string) (*models.Function, error) {
	for _, fn := range m.functions {
		if fn.ID == id {
			return fn, nil
		}
	}
	return nil, storage.ErrNotFound
}

func (m *mockStorage) Update(fn *models.Function) error {
	if _, exists := m.functions[fn.Name]; !exists {
		return storage.ErrNotFound
	}
	m.functions[fn.Name] = fn
	return nil
}

func (m *mockStorage) Delete(name string) error {
	if _, exists := m.functions[name]; !exists {
		return storage.ErrNotFound
	}
	delete(m.functions, name)
	return nil
}

func (m *mockStorage) List() ([]*models.Function, error) {
	var result []*models.Function
	for _, fn := range m.functions {
		result = append(result, fn)
	}
	return result, nil
}

func (m *mockStorage) SaveCode(name string, code []byte) (string, error) {
	m.code[name] = code
	return "/code/" + name, nil
}

func (m *mockStorage) GetCode(name string) ([]byte, error) {
	code, ok := m.code[name]
	if !ok {
		return nil, storage.ErrNotFound
	}
	return code, nil
}

func setupTestServer() (*Server, *mockStorage) {
	store := newMockStorage()
	mgr := function.NewManager(store, nil) // nil firecracker manager for tests
	server := NewServer(mgr)
	return server, store
}

func TestHealthCheck(t *testing.T) {
	server, _ := setupTestServer()

	req := httptest.NewRequest("GET", "/health", nil)
	rr := httptest.NewRecorder()

	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", rr.Code)
	}

	var response map[string]string
	if err := json.NewDecoder(rr.Body).Decode(&response); err != nil {
		t.Fatal(err)
	}

	if response["status"] != "healthy" {
		t.Errorf("Expected status 'healthy', got '%s'", response["status"])
	}

	if response["service"] != "impuls" {
		t.Errorf("Expected service 'impuls', got '%s'", response["service"])
	}
}

func TestCreateFunction(t *testing.T) {
	server, _ := setupTestServer()

	funcReq := models.CreateFunctionRequest{
		Name:    "test-function",
		Runtime: models.RuntimeNodeJS20,
		Handler: "index.handler",
		Code:    "exports.handler = () => {};",
	}

	body, _ := json.Marshal(funcReq)
	req := httptest.NewRequest("POST", "/api/v1/functions", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Errorf("Expected status 201, got %d: %s", rr.Code, rr.Body.String())
	}

	var response models.Function
	if err := json.NewDecoder(rr.Body).Decode(&response); err != nil {
		t.Fatal(err)
	}

	if response.Name != "test-function" {
		t.Errorf("Expected name 'test-function', got '%s'", response.Name)
	}

	if response.Runtime != models.RuntimeNodeJS20 {
		t.Errorf("Expected runtime '%s', got '%s'", models.RuntimeNodeJS20, response.Runtime)
	}
}

func TestCreateFunctionInvalidRequest(t *testing.T) {
	server, _ := setupTestServer()

	// Missing required fields
	funcReq := models.CreateFunctionRequest{
		Name: "test-function",
		// Missing runtime, handler, code
	}

	body, _ := json.Marshal(funcReq)
	req := httptest.NewRequest("POST", "/api/v1/functions", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}
}

func TestCreateFunctionDuplicate(t *testing.T) {
	server, _ := setupTestServer()

	funcReq := models.CreateFunctionRequest{
		Name:    "test-function",
		Runtime: models.RuntimeNodeJS20,
		Handler: "index.handler",
		Code:    "exports.handler = () => {};",
	}

	body, _ := json.Marshal(funcReq)

	// Create first time
	req := httptest.NewRequest("POST", "/api/v1/functions", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("First creation failed: %d", rr.Code)
	}

	// Create duplicate
	req = httptest.NewRequest("POST", "/api/v1/functions", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500 for duplicate, got %d", rr.Code)
	}
}

func TestListFunctions(t *testing.T) {
	server, _ := setupTestServer()

	// Create some functions first
	for _, name := range []string{"fn-1", "fn-2", "fn-3"} {
		funcReq := models.CreateFunctionRequest{
			Name:    name,
			Runtime: models.RuntimeNodeJS20,
			Handler: "index.handler",
			Code:    "exports.handler = () => {};",
		}
		body, _ := json.Marshal(funcReq)
		req := httptest.NewRequest("POST", "/api/v1/functions", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		server.Router().ServeHTTP(rr, req)
	}

	// List functions
	req := httptest.NewRequest("GET", "/api/v1/functions", nil)
	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", rr.Code)
	}

	var response map[string]interface{}
	if err := json.NewDecoder(rr.Body).Decode(&response); err != nil {
		t.Fatal(err)
	}

	count := int(response["count"].(float64))
	if count != 3 {
		t.Errorf("Expected count 3, got %d", count)
	}
}

func TestGetFunction(t *testing.T) {
	server, _ := setupTestServer()

	// Create a function
	funcReq := models.CreateFunctionRequest{
		Name:    "test-function",
		Runtime: models.RuntimeNodeJS20,
		Handler: "index.handler",
		Code:    "exports.handler = () => {};",
	}
	body, _ := json.Marshal(funcReq)
	req := httptest.NewRequest("POST", "/api/v1/functions", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	// Get the function
	req = httptest.NewRequest("GET", "/api/v1/functions/test-function", nil)
	rr = httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", rr.Code)
	}

	var response models.Function
	if err := json.NewDecoder(rr.Body).Decode(&response); err != nil {
		t.Fatal(err)
	}

	if response.Name != "test-function" {
		t.Errorf("Expected name 'test-function', got '%s'", response.Name)
	}
}

func TestGetFunctionNotFound(t *testing.T) {
	server, _ := setupTestServer()

	req := httptest.NewRequest("GET", "/api/v1/functions/non-existent", nil)
	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("Expected status 404, got %d", rr.Code)
	}
}

func TestUpdateFunction(t *testing.T) {
	server, _ := setupTestServer()

	// Create a function
	funcReq := models.CreateFunctionRequest{
		Name:       "test-function",
		Runtime:    models.RuntimeNodeJS20,
		Handler:    "index.handler",
		Code:       "exports.handler = () => {};",
		MemoryMB:   128,
		TimeoutSec: 30,
	}
	body, _ := json.Marshal(funcReq)
	req := httptest.NewRequest("POST", "/api/v1/functions", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	// Update the function
	memoryMB := 256
	timeoutSec := 60
	updateReq := models.UpdateFunctionRequest{
		MemoryMB:   &memoryMB,
		TimeoutSec: &timeoutSec,
	}
	body, _ = json.Marshal(updateReq)
	req = httptest.NewRequest("PUT", "/api/v1/functions/test-function", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var response models.Function
	if err := json.NewDecoder(rr.Body).Decode(&response); err != nil {
		t.Fatal(err)
	}

	if response.MemoryMB != 256 {
		t.Errorf("Expected MemoryMB 256, got %d", response.MemoryMB)
	}

	if response.TimeoutSec != 60 {
		t.Errorf("Expected TimeoutSec 60, got %d", response.TimeoutSec)
	}
}

func TestDeleteFunction(t *testing.T) {
	server, _ := setupTestServer()

	// Create a function
	funcReq := models.CreateFunctionRequest{
		Name:    "test-function",
		Runtime: models.RuntimeNodeJS20,
		Handler: "index.handler",
		Code:    "exports.handler = () => {};",
	}
	body, _ := json.Marshal(funcReq)
	req := httptest.NewRequest("POST", "/api/v1/functions", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	// Delete the function
	req = httptest.NewRequest("DELETE", "/api/v1/functions/test-function", nil)
	rr = httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", rr.Code)
	}

	// Verify it's deleted
	req = httptest.NewRequest("GET", "/api/v1/functions/test-function", nil)
	rr = httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("Expected status 404 after deletion, got %d", rr.Code)
	}
}

func TestDeleteFunctionNotFound(t *testing.T) {
	server, _ := setupTestServer()

	req := httptest.NewRequest("DELETE", "/api/v1/functions/non-existent", nil)
	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("Expected status 404, got %d", rr.Code)
	}
}

func TestListVMs(t *testing.T) {
	server, _ := setupTestServer()

	req := httptest.NewRequest("GET", "/api/v1/vms", nil)
	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	// VM routes are registered but return empty list
	// This is currently a placeholder
	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", rr.Code)
	}
}
