package storage

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/oblak/impuls/internal/models"
)

func TestNewFileStorage(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "impuls-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	fs, err := NewFileStorage(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create FileStorage: %v", err)
	}

	// Check directories were created
	dirs := []string{"metadata", "code"}
	for _, dir := range dirs {
		path := filepath.Join(tmpDir, dir)
		if _, err := os.Stat(path); os.IsNotExist(err) {
			t.Errorf("Expected directory %s to be created", path)
		}
	}

	// Initially should have no functions
	fns, err := fs.List()
	if err != nil {
		t.Fatalf("Failed to list functions: %v", err)
	}
	if len(fns) != 0 {
		t.Errorf("Expected 0 functions, got %d", len(fns))
	}
}

func TestFileStorageCreate(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "impuls-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	fs, err := NewFileStorage(tmpDir)
	if err != nil {
		t.Fatal(err)
	}

	fn := &models.Function{
		ID:         "test-id",
		Name:       "test-function",
		Runtime:    models.RuntimeNodeJS20,
		Handler:    "index.handler",
		Code:       "exports.handler = () => {};",
		MemoryMB:   128,
		TimeoutSec: 30,
	}

	// Create function
	if err := fs.Create(fn); err != nil {
		t.Fatalf("Failed to create function: %v", err)
	}

	// Verify it can be retrieved
	got, err := fs.Get("test-function")
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
}

func TestFileStorageCreateDuplicate(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "impuls-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	fs, err := NewFileStorage(tmpDir)
	if err != nil {
		t.Fatal(err)
	}

	fn := &models.Function{
		ID:      "test-id",
		Name:    "test-function",
		Runtime: models.RuntimeNodeJS20,
		Handler: "index.handler",
	}

	// Create function
	if err := fs.Create(fn); err != nil {
		t.Fatal(err)
	}

	// Try to create duplicate
	err = fs.Create(fn)
	if err == nil {
		t.Error("Expected error when creating duplicate function")
	}
	if err != ErrAlreadyExists {
		t.Errorf("Expected ErrAlreadyExists, got %v", err)
	}
}

func TestFileStorageGet(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "impuls-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	fs, err := NewFileStorage(tmpDir)
	if err != nil {
		t.Fatal(err)
	}

	// Try to get non-existent function
	_, err = fs.Get("non-existent")
	if err == nil {
		t.Error("Expected error when getting non-existent function")
	}
	if err != ErrNotFound {
		t.Errorf("Expected ErrNotFound, got %v", err)
	}
}

func TestFileStorageUpdate(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "impuls-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	fs, err := NewFileStorage(tmpDir)
	if err != nil {
		t.Fatal(err)
	}

	fn := &models.Function{
		ID:         "test-id",
		Name:       "test-function",
		Runtime:    models.RuntimeNodeJS20,
		Handler:    "index.handler",
		MemoryMB:   128,
		TimeoutSec: 30,
	}

	if err := fs.Create(fn); err != nil {
		t.Fatal(err)
	}

	// Update function
	fn.MemoryMB = 256
	fn.TimeoutSec = 60
	if err := fs.Update(fn); err != nil {
		t.Fatalf("Failed to update function: %v", err)
	}

	// Verify update
	got, err := fs.Get("test-function")
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

func TestFileStorageDelete(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "impuls-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	fs, err := NewFileStorage(tmpDir)
	if err != nil {
		t.Fatal(err)
	}

	fn := &models.Function{
		ID:      "test-id",
		Name:    "test-function",
		Runtime: models.RuntimeNodeJS20,
		Handler: "index.handler",
	}

	if err := fs.Create(fn); err != nil {
		t.Fatal(err)
	}

	// Delete function
	if err := fs.Delete("test-function"); err != nil {
		t.Fatalf("Failed to delete function: %v", err)
	}

	// Verify deletion
	_, err = fs.Get("test-function")
	if err != ErrNotFound {
		t.Errorf("Expected ErrNotFound after deletion, got %v", err)
	}
}

func TestFileStorageList(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "impuls-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	fs, err := NewFileStorage(tmpDir)
	if err != nil {
		t.Fatal(err)
	}

	// Create multiple functions
	functions := []*models.Function{
		{ID: "1", Name: "fn-1", Runtime: models.RuntimeNodeJS20, Handler: "index.handler"},
		{ID: "2", Name: "fn-2", Runtime: models.RuntimePython312, Handler: "main.handler"},
		{ID: "3", Name: "fn-3", Runtime: models.RuntimeDotNet8, Handler: "Function.Handler"},
	}

	for _, fn := range functions {
		if err := fs.Create(fn); err != nil {
			t.Fatal(err)
		}
	}

	// List all
	list, err := fs.List()
	if err != nil {
		t.Fatal(err)
	}

	if len(list) != 3 {
		t.Errorf("Expected 3 functions, got %d", len(list))
	}
}

func TestFileStorageSaveAndGetCode(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "impuls-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	fs, err := NewFileStorage(tmpDir)
	if err != nil {
		t.Fatal(err)
	}

	code := []byte("exports.handler = async (event) => { return event; };")

	// Save code
	path, err := fs.SaveCode("test-function", code)
	if err != nil {
		t.Fatalf("Failed to save code: %v", err)
	}

	if path == "" {
		t.Error("Expected non-empty code path")
	}

	// Get code
	got, err := fs.GetCode("test-function")
	if err != nil {
		t.Fatalf("Failed to get code: %v", err)
	}

	if string(got) != string(code) {
		t.Errorf("Code mismatch: expected %s, got %s", code, got)
	}
}

func TestFileStorageGetByID(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "impuls-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	fs, err := NewFileStorage(tmpDir)
	if err != nil {
		t.Fatal(err)
	}

	fn := &models.Function{
		ID:      "unique-id-123",
		Name:    "test-function",
		Runtime: models.RuntimeNodeJS20,
		Handler: "index.handler",
	}

	if err := fs.Create(fn); err != nil {
		t.Fatal(err)
	}

	// Get by ID
	got, err := fs.GetByID("unique-id-123")
	if err != nil {
		t.Fatalf("Failed to get by ID: %v", err)
	}

	if got.Name != "test-function" {
		t.Errorf("Expected name 'test-function', got %s", got.Name)
	}

	// Get non-existent ID
	_, err = fs.GetByID("non-existent-id")
	if err != ErrNotFound {
		t.Errorf("Expected ErrNotFound, got %v", err)
	}
}
