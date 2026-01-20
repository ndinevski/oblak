package function

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/oblak/impuls/internal/firecracker"
	"github.com/oblak/impuls/internal/models"
	"github.com/oblak/impuls/internal/storage"
)

// Manager handles function operations
type Manager struct {
	storage   storage.Storage
	fcManager *firecracker.Manager
	vmPool    *firecracker.VMPool
}

// NewManager creates a new function manager
func NewManager(store storage.Storage, fcManager *firecracker.Manager) *Manager {
	return &Manager{
		storage:   store,
		fcManager: fcManager,
	}
}

// Create creates a new function
func (m *Manager) Create(req *models.CreateFunctionRequest) (*models.Function, error) {
	if err := req.Validate(); err != nil {
		return nil, err
	}

	// Check if function already exists
	if _, err := m.storage.Get(req.Name); err == nil {
		return nil, fmt.Errorf("function %s already exists", req.Name)
	}

	// Set defaults
	memoryMB := req.MemoryMB
	if memoryMB == 0 {
		memoryMB = 128
	}

	timeoutSec := req.TimeoutSec
	if timeoutSec == 0 {
		timeoutSec = 30
	}

	fn := &models.Function{
		ID:          uuid.New().String(),
		Name:        req.Name,
		Description: req.Description,
		Runtime:     req.Runtime,
		Handler:     req.Handler,
		Code:        req.Code,
		MemoryMB:    memoryMB,
		TimeoutSec:  timeoutSec,
		Environment: req.Environment,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	// Create function in storage first (needed for PostgreSQL)
	if err := m.storage.Create(fn); err != nil {
		return nil, fmt.Errorf("failed to create function: %w", err)
	}

	// Save code to storage (for file storage, creates separate code file)
	codePath, err := m.storage.SaveCode(fn.Name, []byte(req.Code))
	if err != nil {
		// Rollback: delete the created function
		m.storage.Delete(fn.Name)
		return nil, fmt.Errorf("failed to save function code: %w", err)
	}
	fn.CodePath = codePath

	// Update with code path
	if err := m.storage.Update(fn); err != nil {
		// Rollback: delete the created function
		m.storage.Delete(fn.Name)
		return nil, fmt.Errorf("failed to update function with code path: %w", err)
	}

	return fn, nil
}

// Get retrieves a function by name
func (m *Manager) Get(name string) (*models.Function, error) {
	fn, err := m.storage.Get(name)
	if err != nil {
		if err == storage.ErrNotFound {
			return nil, fmt.Errorf("function %s not found", name)
		}
		return nil, err
	}
	return fn, nil
}

// Update updates an existing function
func (m *Manager) Update(name string, req *models.UpdateFunctionRequest) (*models.Function, error) {
	fn, err := m.storage.Get(name)
	if err != nil {
		if err == storage.ErrNotFound {
			return nil, fmt.Errorf("function %s not found", name)
		}
		return nil, err
	}

	// Apply updates
	if req.Description != nil {
		fn.Description = *req.Description
	}
	if req.Runtime != nil {
		fn.Runtime = *req.Runtime
	}
	if req.Handler != nil {
		fn.Handler = *req.Handler
	}
	if req.Code != nil {
		fn.Code = *req.Code
		// Update stored code
		codePath, err := m.storage.SaveCode(fn.Name, []byte(*req.Code))
		if err != nil {
			return nil, fmt.Errorf("failed to save function code: %w", err)
		}
		fn.CodePath = codePath
	}
	if req.MemoryMB != nil {
		fn.MemoryMB = *req.MemoryMB
	}
	if req.TimeoutSec != nil {
		fn.TimeoutSec = *req.TimeoutSec
	}
	if req.Environment != nil {
		fn.Environment = req.Environment
	}

	fn.UpdatedAt = time.Now()

	if err := m.storage.Update(fn); err != nil {
		return nil, fmt.Errorf("failed to update function: %w", err)
	}

	return fn, nil
}

// Delete deletes a function
func (m *Manager) Delete(name string) error {
	if err := m.storage.Delete(name); err != nil {
		if err == storage.ErrNotFound {
			return fmt.Errorf("function %s not found", name)
		}
		return err
	}
	return nil
}

// List returns all functions
func (m *Manager) List() ([]*models.Function, error) {
	return m.storage.List()
}

// Invoke executes a function
func (m *Manager) Invoke(ctx context.Context, name string, payload interface{}) (*models.InvocationResponse, error) {
	startTime := time.Now()

	fn, err := m.storage.Get(name)
	if err != nil {
		if err == storage.ErrNotFound {
			return nil, fmt.Errorf("function %s not found", name)
		}
		return nil, err
	}

	// Create timeout context
	timeoutCtx, cancel := context.WithTimeout(ctx, time.Duration(fn.TimeoutSec)*time.Second)
	defer cancel()

	// Get function code
	code, err := m.storage.GetCode(name)
	if err != nil {
		return nil, fmt.Errorf("failed to get function code: %w", err)
	}

	// Create VM configuration
	vmConfig := firecracker.VMConfig{
		FunctionName: fn.Name,
		MemoryMB:     fn.MemoryMB,
		VCPUs:        1,
		CodePath:     fn.CodePath,
		Handler:      fn.Handler,
		Runtime:      string(fn.Runtime),
		Environment:  fn.Environment,
	}

	// Create VM
	vm, err := m.fcManager.CreateVM(timeoutCtx, vmConfig)
	if err != nil {
		return &models.InvocationResponse{
			StatusCode: 500,
			Error:      fmt.Sprintf("failed to create VM: %v", err),
			Duration:   time.Since(startTime).Milliseconds(),
		}, nil
	}
	defer m.fcManager.StopVM(vm.ID)

	// Prepare invocation payload
	invocationPayload := map[string]interface{}{
		"handler": fn.Handler,
		"code":    string(code),
		"event":   payload,
		"env":     fn.Environment,
	}

	payloadBytes, err := json.Marshal(invocationPayload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}

	// Execute function in VM
	result, err := m.fcManager.ExecuteFunction(timeoutCtx, vm, payloadBytes)
	if err != nil {
		return &models.InvocationResponse{
			StatusCode: 500,
			Error:      fmt.Sprintf("failed to execute function: %v", err),
			Duration:   time.Since(startTime).Milliseconds(),
		}, nil
	}

	// Parse result
	var response models.InvocationResponse
	if err := json.Unmarshal(result, &response); err != nil {
		// Return raw result if not JSON
		return &models.InvocationResponse{
			StatusCode: 200,
			Body:       string(result),
			Duration:   time.Since(startTime).Milliseconds(),
		}, nil
	}

	response.Duration = time.Since(startTime).Milliseconds()
	return &response, nil
}

// InvokeLocal invokes a function locally without Firecracker (for testing/development)
func (m *Manager) InvokeLocal(ctx context.Context, name string, payload interface{}) (*models.InvocationResponse, error) {
	startTime := time.Now()

	fn, err := m.storage.Get(name)
	if err != nil {
		if err == storage.ErrNotFound {
			return nil, fmt.Errorf("function %s not found", name)
		}
		return nil, err
	}

	// Get function code
	code, err := m.storage.GetCode(name)
	if err != nil {
		return nil, fmt.Errorf("failed to get function code: %w", err)
	}

	// Execute based on runtime
	var result interface{}
	var execErr error

	switch models.GetRuntimeLanguage(fn.Runtime) {
	case "nodejs":
		result, execErr = executeNodeJSLocal(ctx, fn, code, payload)
	case "python":
		result, execErr = executePythonLocal(ctx, fn, code, payload)
	case "dotnet":
		result, execErr = executeDotNetLocal(ctx, fn, code, payload)
	default:
		execErr = fmt.Errorf("unsupported runtime for local execution: %s", fn.Runtime)
	}

	if execErr != nil {
		return &models.InvocationResponse{
			StatusCode: 500,
			Error:      execErr.Error(),
			Duration:   time.Since(startTime).Milliseconds(),
		}, nil
	}

	return &models.InvocationResponse{
		StatusCode: 200,
		Body:       result,
		Duration:   time.Since(startTime).Milliseconds(),
	}, nil
}
