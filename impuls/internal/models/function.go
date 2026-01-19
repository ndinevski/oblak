package models

import "time"

// Runtime represents a supported function runtime
type Runtime string

const (
	RuntimeNodeJS20  Runtime = "nodejs20"
	RuntimeNodeJS18  Runtime = "nodejs18"
	RuntimePython312 Runtime = "python312"
	RuntimePython311 Runtime = "python311"
	RuntimeDotNet8   Runtime = "dotnet8"
	RuntimeDotNet7   Runtime = "dotnet7"
)

// Function represents a serverless function
type Function struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Description string            `json:"description,omitempty"`
	Runtime     Runtime           `json:"runtime"`
	Handler     string            `json:"handler"` // e.g., "index.handler"
	Code        string            `json:"code"`    // Base64 encoded or plain text
	CodePath    string            `json:"-"`       // Internal path to stored code
	MemoryMB    int               `json:"memory_mb"`
	TimeoutSec  int               `json:"timeout_sec"`
	Environment map[string]string `json:"environment,omitempty"`
	CreatedAt   time.Time         `json:"created_at"`
	UpdatedAt   time.Time         `json:"updated_at"`
}

// CreateFunctionRequest is the request body for creating a function
type CreateFunctionRequest struct {
	Name        string            `json:"name"`
	Description string            `json:"description,omitempty"`
	Runtime     Runtime           `json:"runtime"`
	Handler     string            `json:"handler"`
	Code        string            `json:"code"`
	MemoryMB    int               `json:"memory_mb,omitempty"`
	TimeoutSec  int               `json:"timeout_sec,omitempty"`
	Environment map[string]string `json:"environment,omitempty"`
}

// UpdateFunctionRequest is the request body for updating a function
type UpdateFunctionRequest struct {
	Description *string           `json:"description,omitempty"`
	Runtime     *Runtime          `json:"runtime,omitempty"`
	Handler     *string           `json:"handler,omitempty"`
	Code        *string           `json:"code,omitempty"`
	MemoryMB    *int              `json:"memory_mb,omitempty"`
	TimeoutSec  *int              `json:"timeout_sec,omitempty"`
	Environment map[string]string `json:"environment,omitempty"`
}

// InvocationRequest is the request body for invoking a function
type InvocationRequest struct {
	Payload interface{} `json:"payload,omitempty"`
}

// InvocationResponse is the response from a function invocation
type InvocationResponse struct {
	StatusCode int         `json:"status_code"`
	Body       interface{} `json:"body"`
	Duration   int64       `json:"duration_ms"`
	Logs       string      `json:"logs,omitempty"`
	Error      string      `json:"error,omitempty"`
}

// FunctionStatus represents the current status of a function
type FunctionStatus string

const (
	StatusActive   FunctionStatus = "active"
	StatusInactive FunctionStatus = "inactive"
	StatusError    FunctionStatus = "error"
)

// Validate validates a CreateFunctionRequest
func (r *CreateFunctionRequest) Validate() error {
	if r.Name == "" {
		return &ValidationError{Field: "name", Message: "name is required"}
	}
	if r.Runtime == "" {
		return &ValidationError{Field: "runtime", Message: "runtime is required"}
	}
	if !isValidRuntime(r.Runtime) {
		return &ValidationError{Field: "runtime", Message: "invalid runtime"}
	}
	if r.Handler == "" {
		return &ValidationError{Field: "handler", Message: "handler is required"}
	}
	if r.Code == "" {
		return &ValidationError{Field: "code", Message: "code is required"}
	}
	return nil
}

func isValidRuntime(r Runtime) bool {
	switch r {
	case RuntimeNodeJS20, RuntimeNodeJS18,
		RuntimePython312, RuntimePython311,
		RuntimeDotNet8, RuntimeDotNet7:
		return true
	default:
		return false
	}
}

// GetRuntimeLanguage returns the base language for a runtime
func GetRuntimeLanguage(r Runtime) string {
	switch r {
	case RuntimeNodeJS20, RuntimeNodeJS18:
		return "nodejs"
	case RuntimePython312, RuntimePython311:
		return "python"
	case RuntimeDotNet8, RuntimeDotNet7:
		return "dotnet"
	default:
		return ""
	}
}

// ValidationError represents a validation error
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

func (e *ValidationError) Error() string {
	return e.Field + ": " + e.Message
}
