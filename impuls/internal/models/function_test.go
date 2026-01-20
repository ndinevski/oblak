package models

import (
	"testing"
)

func TestCreateFunctionRequestValidation(t *testing.T) {
	tests := []struct {
		name     string
		req      CreateFunctionRequest
		wantErr  bool
		errField string
	}{
		{
			name: "valid request",
			req: CreateFunctionRequest{
				Name:    "test-function",
				Runtime: RuntimeNodeJS20,
				Handler: "index.handler",
				Code:    "exports.handler = async () => {};",
			},
			wantErr: false,
		},
		{
			name: "valid python request",
			req: CreateFunctionRequest{
				Name:    "python-fn",
				Runtime: RuntimePython312,
				Handler: "main.handler",
				Code:    "def handler(event, context): return {}",
			},
			wantErr: false,
		},
		{
			name: "missing name",
			req: CreateFunctionRequest{
				Runtime: RuntimeNodeJS20,
				Handler: "index.handler",
				Code:    "exports.handler = async () => {};",
			},
			wantErr:  true,
			errField: "name",
		},
		{
			name: "missing runtime",
			req: CreateFunctionRequest{
				Name:    "test-function",
				Handler: "index.handler",
				Code:    "exports.handler = async () => {};",
			},
			wantErr:  true,
			errField: "runtime",
		},
		{
			name: "invalid runtime",
			req: CreateFunctionRequest{
				Name:    "test-function",
				Runtime: Runtime("invalid"),
				Handler: "index.handler",
				Code:    "exports.handler = async () => {};",
			},
			wantErr:  true,
			errField: "runtime",
		},
		{
			name: "missing handler",
			req: CreateFunctionRequest{
				Name:    "test-function",
				Runtime: RuntimeNodeJS20,
				Code:    "exports.handler = async () => {};",
			},
			wantErr:  true,
			errField: "handler",
		},
		{
			name: "missing code",
			req: CreateFunctionRequest{
				Name:    "test-function",
				Runtime: RuntimeNodeJS20,
				Handler: "index.handler",
			},
			wantErr:  true,
			errField: "code",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.req.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if tt.wantErr && err != nil {
				ve, ok := err.(*ValidationError)
				if ok && ve.Field != tt.errField {
					t.Errorf("Expected error field %s, got %s", tt.errField, ve.Field)
				}
			}
		})
	}
}

func TestIsValidRuntime(t *testing.T) {
	validRuntimes := []Runtime{
		RuntimeNodeJS20,
		RuntimeNodeJS18,
		RuntimePython312,
		RuntimePython311,
		RuntimeDotNet8,
		RuntimeDotNet7,
	}

	for _, r := range validRuntimes {
		t.Run(string(r), func(t *testing.T) {
			if !isValidRuntime(r) {
				t.Errorf("Expected %s to be valid", r)
			}
		})
	}

	invalidRuntimes := []Runtime{
		Runtime("invalid"),
		Runtime("nodejs14"),
		Runtime("python2"),
		Runtime(""),
	}

	for _, r := range invalidRuntimes {
		t.Run(string(r)+"_invalid", func(t *testing.T) {
			if isValidRuntime(r) {
				t.Errorf("Expected %s to be invalid", r)
			}
		})
	}
}

func TestGetRuntimeLanguage(t *testing.T) {
	tests := []struct {
		runtime  Runtime
		expected string
	}{
		{RuntimeNodeJS20, "nodejs"},
		{RuntimeNodeJS18, "nodejs"},
		{RuntimePython312, "python"},
		{RuntimePython311, "python"},
		{RuntimeDotNet8, "dotnet"},
		{RuntimeDotNet7, "dotnet"},
		{Runtime("invalid"), ""},
	}

	for _, tt := range tests {
		t.Run(string(tt.runtime), func(t *testing.T) {
			got := GetRuntimeLanguage(tt.runtime)
			if got != tt.expected {
				t.Errorf("GetRuntimeLanguage(%s) = %s, want %s", tt.runtime, got, tt.expected)
			}
		})
	}
}

func TestValidationError(t *testing.T) {
	err := &ValidationError{
		Field:   "name",
		Message: "is required",
	}

	expected := "name: is required"
	if err.Error() != expected {
		t.Errorf("Expected error message '%s', got '%s'", expected, err.Error())
	}
}

func TestFunctionDefaults(t *testing.T) {
	fn := Function{
		Name:    "test",
		Runtime: RuntimeNodeJS20,
	}

	// Check that memory and timeout are zero (need to be set by manager)
	if fn.MemoryMB != 0 {
		t.Errorf("Expected default MemoryMB to be 0, got %d", fn.MemoryMB)
	}

	if fn.TimeoutSec != 0 {
		t.Errorf("Expected default TimeoutSec to be 0, got %d", fn.TimeoutSec)
	}
}

func TestFunctionEnvironment(t *testing.T) {
	fn := Function{
		Name:    "test",
		Runtime: RuntimePython312,
		Environment: map[string]string{
			"API_KEY":      "secret",
			"DATABASE_URL": "postgres://localhost/db",
		},
	}

	if len(fn.Environment) != 2 {
		t.Errorf("Expected 2 environment variables, got %d", len(fn.Environment))
	}

	if fn.Environment["API_KEY"] != "secret" {
		t.Errorf("Expected API_KEY=secret, got %s", fn.Environment["API_KEY"])
	}
}
