package storage

import (
	"database/sql"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/oblak/impuls/internal/models"
)

// getTestDBConnStr returns a connection string for testing
// It uses environment variable or defaults to localhost
func getTestDBConnStr() string {
	connStr := os.Getenv("TEST_DATABASE_URL")
	if connStr == "" {
		connStr = "postgres://postgres:postgres@localhost:5432/impuls_test?sslmode=disable"
	}
	return connStr
}

// setupTestDB creates a test database and returns a connection string
func setupTestDB(t *testing.T) (*PostgresStorage, func()) {
	connStr := getTestDBConnStr()

	// Try to connect
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		t.Skipf("Skipping PostgreSQL tests: %v", err)
		return nil, func() {}
	}

	if err := db.Ping(); err != nil {
		t.Skipf("Skipping PostgreSQL tests (no database available): %v", err)
		return nil, func() {}
	}
	db.Close()

	// Create storage
	ps, err := NewPostgresStorage(connStr)
	if err != nil {
		t.Fatalf("Failed to create PostgresStorage: %v", err)
	}

	// Cleanup function
	cleanup := func() {
		// Clear all functions
		ps.db.Exec("TRUNCATE functions")
		ps.Close()
	}

	// Clear any existing data
	ps.db.Exec("TRUNCATE functions")

	return ps, cleanup
}

func TestNewPostgresStorage(t *testing.T) {
	ps, cleanup := setupTestDB(t)
	if ps == nil {
		return
	}
	defer cleanup()

	// Initially should have no functions
	fns, err := ps.List()
	if err != nil {
		t.Fatalf("Failed to list functions: %v", err)
	}
	if len(fns) != 0 {
		t.Errorf("Expected 0 functions, got %d", len(fns))
	}
}

func TestPostgresStorageCreate(t *testing.T) {
	ps, cleanup := setupTestDB(t)
	if ps == nil {
		return
	}
	defer cleanup()

	fn := &models.Function{
		ID:          "test-id",
		Name:        "test-function",
		Runtime:     models.RuntimeNodeJS20,
		Handler:     "index.handler",
		Code:        "exports.handler = () => {};",
		MemoryMB:    128,
		TimeoutSec:  30,
		Environment: map[string]string{"KEY": "value"},
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	// Create function
	if err := ps.Create(fn); err != nil {
		t.Fatalf("Failed to create function: %v", err)
	}

	// Verify it can be retrieved
	got, err := ps.Get("test-function")
	if err != nil {
		t.Fatalf("Failed to get function: %v", err)
	}

	if got.ID != fn.ID {
		t.Errorf("Expected ID %s, got %s", fn.ID, got.ID)
	}
	if got.Name != fn.Name {
		t.Errorf("Expected Name %s, got %s", fn.Name, got.Name)
	}
	if got.Runtime != fn.Runtime {
		t.Errorf("Expected Runtime %s, got %s", fn.Runtime, got.Runtime)
	}
	if got.Environment["KEY"] != "value" {
		t.Errorf("Expected environment KEY=value, got %v", got.Environment)
	}
}

func TestPostgresStorageCreateDuplicate(t *testing.T) {
	ps, cleanup := setupTestDB(t)
	if ps == nil {
		return
	}
	defer cleanup()

	fn := &models.Function{
		ID:        "test-id",
		Name:      "test-function",
		Runtime:   models.RuntimeNodeJS20,
		Handler:   "index.handler",
		Code:      "exports.handler = () => {};",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	// Create function
	if err := ps.Create(fn); err != nil {
		t.Fatal(err)
	}

	// Try to create duplicate
	err := ps.Create(fn)
	if err == nil {
		t.Error("Expected error when creating duplicate function")
	}
	if err != ErrAlreadyExists {
		t.Errorf("Expected ErrAlreadyExists, got %v", err)
	}
}

func TestPostgresStorageGet(t *testing.T) {
	ps, cleanup := setupTestDB(t)
	if ps == nil {
		return
	}
	defer cleanup()

	// Try to get non-existent function
	_, err := ps.Get("non-existent")
	if err == nil {
		t.Error("Expected error when getting non-existent function")
	}
	if err != ErrNotFound {
		t.Errorf("Expected ErrNotFound, got %v", err)
	}
}

func TestPostgresStorageGetByID(t *testing.T) {
	ps, cleanup := setupTestDB(t)
	if ps == nil {
		return
	}
	defer cleanup()

	fn := &models.Function{
		ID:        "unique-id-123",
		Name:      "test-function",
		Runtime:   models.RuntimeNodeJS20,
		Handler:   "index.handler",
		Code:      "exports.handler = () => {};",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if err := ps.Create(fn); err != nil {
		t.Fatal(err)
	}

	// Get by ID
	got, err := ps.GetByID("unique-id-123")
	if err != nil {
		t.Fatalf("Failed to get by ID: %v", err)
	}

	if got.Name != "test-function" {
		t.Errorf("Expected name 'test-function', got %s", got.Name)
	}

	// Get non-existent ID
	_, err = ps.GetByID("non-existent-id")
	if err != ErrNotFound {
		t.Errorf("Expected ErrNotFound, got %v", err)
	}
}

func TestPostgresStorageUpdate(t *testing.T) {
	ps, cleanup := setupTestDB(t)
	if ps == nil {
		return
	}
	defer cleanup()

	fn := &models.Function{
		ID:         "test-id",
		Name:       "test-function",
		Runtime:    models.RuntimeNodeJS20,
		Handler:    "index.handler",
		Code:       "exports.handler = () => {};",
		MemoryMB:   128,
		TimeoutSec: 30,
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}

	if err := ps.Create(fn); err != nil {
		t.Fatal(err)
	}

	// Update function
	fn.MemoryMB = 256
	fn.TimeoutSec = 60
	fn.UpdatedAt = time.Now()
	if err := ps.Update(fn); err != nil {
		t.Fatalf("Failed to update function: %v", err)
	}

	// Verify update
	got, err := ps.Get("test-function")
	if err != nil {
		t.Fatal(err)
	}

	if got.MemoryMB != 256 {
		t.Errorf("Expected MemoryMB 256, got %d", got.MemoryMB)
	}
	if got.TimeoutSec != 60 {
		t.Errorf("Expected TimeoutSec 60, got %d", got.TimeoutSec)
	}
}

func TestPostgresStorageUpdateNonExistent(t *testing.T) {
	ps, cleanup := setupTestDB(t)
	if ps == nil {
		return
	}
	defer cleanup()

	fn := &models.Function{
		ID:        "test-id",
		Name:      "non-existent",
		Runtime:   models.RuntimeNodeJS20,
		Handler:   "index.handler",
		Code:      "exports.handler = () => {};",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	err := ps.Update(fn)
	if err != ErrNotFound {
		t.Errorf("Expected ErrNotFound, got %v", err)
	}
}

func TestPostgresStorageDelete(t *testing.T) {
	ps, cleanup := setupTestDB(t)
	if ps == nil {
		return
	}
	defer cleanup()

	fn := &models.Function{
		ID:        "test-id",
		Name:      "test-function",
		Runtime:   models.RuntimeNodeJS20,
		Handler:   "index.handler",
		Code:      "exports.handler = () => {};",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if err := ps.Create(fn); err != nil {
		t.Fatal(err)
	}

	// Delete function
	if err := ps.Delete("test-function"); err != nil {
		t.Fatalf("Failed to delete function: %v", err)
	}

	// Verify deletion
	_, err := ps.Get("test-function")
	if err != ErrNotFound {
		t.Errorf("Expected ErrNotFound after deletion, got %v", err)
	}
}

func TestPostgresStorageDeleteNonExistent(t *testing.T) {
	ps, cleanup := setupTestDB(t)
	if ps == nil {
		return
	}
	defer cleanup()

	err := ps.Delete("non-existent")
	if err != ErrNotFound {
		t.Errorf("Expected ErrNotFound, got %v", err)
	}
}

func TestPostgresStorageList(t *testing.T) {
	ps, cleanup := setupTestDB(t)
	if ps == nil {
		return
	}
	defer cleanup()

	// Create multiple functions
	functions := []*models.Function{
		{
			ID: "1", Name: "fn-1", Runtime: models.RuntimeNodeJS20,
			Handler: "index.handler", Code: "code1",
			CreatedAt: time.Now(), UpdatedAt: time.Now(),
		},
		{
			ID: "2", Name: "fn-2", Runtime: models.RuntimePython312,
			Handler: "main.handler", Code: "code2",
			CreatedAt: time.Now(), UpdatedAt: time.Now(),
		},
		{
			ID: "3", Name: "fn-3", Runtime: models.RuntimeDotNet8,
			Handler: "Function.Handler", Code: "code3",
			CreatedAt: time.Now(), UpdatedAt: time.Now(),
		},
	}

	for _, fn := range functions {
		if err := ps.Create(fn); err != nil {
			t.Fatal(err)
		}
	}

	// List all
	list, err := ps.List()
	if err != nil {
		t.Fatal(err)
	}

	if len(list) != 3 {
		t.Errorf("Expected 3 functions, got %d", len(list))
	}
}

func TestPostgresStorageSaveAndGetCode(t *testing.T) {
	ps, cleanup := setupTestDB(t)
	if ps == nil {
		return
	}
	defer cleanup()

	// Create a function first
	fn := &models.Function{
		ID:        "test-id",
		Name:      "test-function",
		Runtime:   models.RuntimeNodeJS20,
		Handler:   "index.handler",
		Code:      "initial code",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if err := ps.Create(fn); err != nil {
		t.Fatal(err)
	}

	code := []byte("exports.handler = async (event) => { return event; };")

	// Save code
	path, err := ps.SaveCode("test-function", code)
	if err != nil {
		t.Fatalf("Failed to save code: %v", err)
	}

	if path == "" {
		t.Error("Expected non-empty code path")
	}

	// Get code
	got, err := ps.GetCode("test-function")
	if err != nil {
		t.Fatalf("Failed to get code: %v", err)
	}

	if string(got) != string(code) {
		t.Errorf("Code mismatch: expected %s, got %s", code, got)
	}
}

func TestPostgresStorageGetCodeNonExistent(t *testing.T) {
	ps, cleanup := setupTestDB(t)
	if ps == nil {
		return
	}
	defer cleanup()

	_, err := ps.GetCode("non-existent")
	if err != ErrNotFound {
		t.Errorf("Expected ErrNotFound, got %v", err)
	}
}

func TestPostgresStorageEnvironmentVariables(t *testing.T) {
	ps, cleanup := setupTestDB(t)
	if ps == nil {
		return
	}
	defer cleanup()

	env := map[string]string{
		"DB_HOST":    "localhost",
		"DB_PORT":    "5432",
		"API_KEY":    "secret123",
		"DEBUG_MODE": "true",
	}

	fn := &models.Function{
		ID:          "test-id",
		Name:        "test-function",
		Runtime:     models.RuntimeNodeJS20,
		Handler:     "index.handler",
		Code:        "exports.handler = () => {};",
		Environment: env,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	if err := ps.Create(fn); err != nil {
		t.Fatal(err)
	}

	// Retrieve and verify
	got, err := ps.Get("test-function")
	if err != nil {
		t.Fatal(err)
	}

	for key, expectedValue := range env {
		if gotValue, ok := got.Environment[key]; !ok {
			t.Errorf("Missing environment variable: %s", key)
		} else if gotValue != expectedValue {
			t.Errorf("Environment variable %s: expected %s, got %s", key, expectedValue, gotValue)
		}
	}
}

func TestPostgresStorageEmptyEnvironment(t *testing.T) {
	ps, cleanup := setupTestDB(t)
	if ps == nil {
		return
	}
	defer cleanup()

	fn := &models.Function{
		ID:          "test-id",
		Name:        "test-function",
		Runtime:     models.RuntimeNodeJS20,
		Handler:     "index.handler",
		Code:        "exports.handler = () => {};",
		Environment: nil,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	if err := ps.Create(fn); err != nil {
		t.Fatal(err)
	}

	got, err := ps.Get("test-function")
	if err != nil {
		t.Fatal(err)
	}

	if got.Environment == nil {
		// OK - nil is acceptable
	} else if len(got.Environment) != 0 {
		t.Errorf("Expected empty environment, got %v", got.Environment)
	}
}

// Benchmark tests
func BenchmarkPostgresStorageCreate(b *testing.B) {
	connStr := getTestDBConnStr()
	ps, err := NewPostgresStorage(connStr)
	if err != nil {
		b.Skipf("Skipping benchmark: %v", err)
		return
	}
	defer ps.Close()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		fn := &models.Function{
			ID:        fmt.Sprintf("bench-%d", i),
			Name:      fmt.Sprintf("bench-fn-%d", i),
			Runtime:   models.RuntimeNodeJS20,
			Handler:   "index.handler",
			Code:      "exports.handler = () => {};",
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
		ps.Create(fn)
	}
	b.StopTimer()
	ps.db.Exec("TRUNCATE functions")
}

func BenchmarkPostgresStorageGet(b *testing.B) {
	connStr := getTestDBConnStr()
	ps, err := NewPostgresStorage(connStr)
	if err != nil {
		b.Skipf("Skipping benchmark: %v", err)
		return
	}
	defer ps.Close()

	// Setup test data
	fn := &models.Function{
		ID:        "bench-id",
		Name:      "bench-function",
		Runtime:   models.RuntimeNodeJS20,
		Handler:   "index.handler",
		Code:      "exports.handler = () => {};",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	ps.Create(fn)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ps.Get("bench-function")
	}
	b.StopTimer()
	ps.db.Exec("TRUNCATE functions")
}
