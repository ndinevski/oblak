package storage

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"

	"github.com/oblak/impuls/internal/models"
)

var (
	ErrNotFound      = errors.New("function not found")
	ErrAlreadyExists = errors.New("function already exists")
)

// Storage defines the interface for function storage
type Storage interface {
	Create(fn *models.Function) error
	Get(name string) (*models.Function, error)
	GetByID(id string) (*models.Function, error)
	Update(fn *models.Function) error
	Delete(name string) error
	List() ([]*models.Function, error)
	SaveCode(name string, code []byte) (string, error)
	GetCode(name string) ([]byte, error)
}

// FileStorage implements Storage using the filesystem
type FileStorage struct {
	basePath    string
	mu          sync.RWMutex
	functionsDB map[string]*models.Function
}

// NewFileStorage creates a new FileStorage instance
func NewFileStorage(basePath string) (*FileStorage, error) {
	// Create directories
	dirs := []string{
		basePath,
		filepath.Join(basePath, "metadata"),
		filepath.Join(basePath, "code"),
	}
	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, err
		}
	}

	fs := &FileStorage{
		basePath:    basePath,
		functionsDB: make(map[string]*models.Function),
	}

	// Load existing functions
	if err := fs.loadAll(); err != nil {
		return nil, err
	}

	return fs, nil
}

// loadAll loads all functions from disk
func (fs *FileStorage) loadAll() error {
	metadataDir := filepath.Join(fs.basePath, "metadata")
	entries, err := os.ReadDir(metadataDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}

		data, err := os.ReadFile(filepath.Join(metadataDir, entry.Name()))
		if err != nil {
			continue
		}

		var fn models.Function
		if err := json.Unmarshal(data, &fn); err != nil {
			continue
		}

		fs.functionsDB[fn.Name] = &fn
	}

	return nil
}

// Create creates a new function
func (fs *FileStorage) Create(fn *models.Function) error {
	fs.mu.Lock()
	defer fs.mu.Unlock()

	if _, exists := fs.functionsDB[fn.Name]; exists {
		return ErrAlreadyExists
	}

	// Save metadata
	if err := fs.saveMetadata(fn); err != nil {
		return err
	}

	fs.functionsDB[fn.Name] = fn
	return nil
}

// Get retrieves a function by name
func (fs *FileStorage) Get(name string) (*models.Function, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()

	fn, exists := fs.functionsDB[name]
	if !exists {
		return nil, ErrNotFound
	}

	return fn, nil
}

// GetByID retrieves a function by ID
func (fs *FileStorage) GetByID(id string) (*models.Function, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()

	for _, fn := range fs.functionsDB {
		if fn.ID == id {
			return fn, nil
		}
	}

	return nil, ErrNotFound
}

// Update updates an existing function
func (fs *FileStorage) Update(fn *models.Function) error {
	fs.mu.Lock()
	defer fs.mu.Unlock()

	if _, exists := fs.functionsDB[fn.Name]; !exists {
		return ErrNotFound
	}

	// Save metadata
	if err := fs.saveMetadata(fn); err != nil {
		return err
	}

	fs.functionsDB[fn.Name] = fn
	return nil
}

// Delete deletes a function
func (fs *FileStorage) Delete(name string) error {
	fs.mu.Lock()
	defer fs.mu.Unlock()

	if _, exists := fs.functionsDB[name]; !exists {
		return ErrNotFound
	}

	// Remove metadata file
	metadataPath := filepath.Join(fs.basePath, "metadata", name+".json")
	os.Remove(metadataPath)

	// Remove code directory
	codePath := filepath.Join(fs.basePath, "code", name)
	os.RemoveAll(codePath)

	delete(fs.functionsDB, name)
	return nil
}

// List returns all functions
func (fs *FileStorage) List() ([]*models.Function, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()

	functions := make([]*models.Function, 0, len(fs.functionsDB))
	for _, fn := range fs.functionsDB {
		functions = append(functions, fn)
	}

	return functions, nil
}

// SaveCode saves function code to disk
func (fs *FileStorage) SaveCode(name string, code []byte) (string, error) {
	codeDir := filepath.Join(fs.basePath, "code", name)
	if err := os.MkdirAll(codeDir, 0755); err != nil {
		return "", err
	}

	codePath := filepath.Join(codeDir, "function.js")
	if err := os.WriteFile(codePath, code, 0644); err != nil {
		return "", err
	}

	return codePath, nil
}

// GetCode retrieves function code from disk
func (fs *FileStorage) GetCode(name string) ([]byte, error) {
	codePath := filepath.Join(fs.basePath, "code", name, "function.js")
	return os.ReadFile(codePath)
}

// saveMetadata saves function metadata to disk
func (fs *FileStorage) saveMetadata(fn *models.Function) error {
	data, err := json.MarshalIndent(fn, "", "  ")
	if err != nil {
		return err
	}

	metadataPath := filepath.Join(fs.basePath, "metadata", fn.Name+".json")
	return os.WriteFile(metadataPath, data, 0644)
}
