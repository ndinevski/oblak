package function

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/oblak/impuls/internal/models"
)

// executePythonLocal executes a Python function locally (without Firecracker)
// This is useful for development and testing
func executePythonLocal(ctx context.Context, fn *models.Function, code []byte, payload interface{}) (interface{}, error) {
	// Create a temporary directory for the function
	tmpDir, err := os.MkdirTemp("", "impuls-python-function-*")
	if err != nil {
		return nil, fmt.Errorf("failed to create temp directory: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	// Write the function code
	functionFile := filepath.Join(tmpDir, "function.py")
	if err := os.WriteFile(functionFile, code, 0644); err != nil {
		return nil, fmt.Errorf("failed to write function code: %w", err)
	}

	// Parse handler (format: "filename.handler_function")
	handlerParts := strings.SplitN(fn.Handler, ".", 2)
	if len(handlerParts) != 2 {
		return nil, fmt.Errorf("invalid handler format: %s (expected 'module.function')", fn.Handler)
	}
	handlerFunction := handlerParts[1]

	// Serialize the payload
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}

	// Create the runner script
	runnerScript := fmt.Sprintf(`
import sys
import json
import traceback
import time

sys.path.insert(0, '%s')

# Import the function module
import function

# Get the handler
handler = getattr(function, '%s', None)
if handler is None or not callable(handler):
    print(json.dumps({'error': 'Handler %s is not a callable'}))
    sys.exit(1)

# Parse the event
event = %s

# Context object (simplified Lambda context)
class Context:
    function_name = '%s'
    function_version = '1'
    memory_limit_in_mb = %d
    _start_time = time.time()
    _timeout = %d
    
    def get_remaining_time_in_millis(self):
        elapsed = time.time() - self._start_time
        return max(0, int((self._timeout - elapsed) * 1000))

context = Context()

# Execute the handler
try:
    import asyncio
    
    if asyncio.iscoroutinefunction(handler):
        result = asyncio.run(handler(event, context))
    else:
        result = handler(event, context)
    
    print(json.dumps({'statusCode': 200, 'body': result}))
except Exception as e:
    print(json.dumps({
        'statusCode': 500,
        'error': str(e),
        'stack': traceback.format_exc()
    }))
`, tmpDir, handlerFunction, handlerFunction, string(payloadJSON), fn.Name, fn.MemoryMB, fn.TimeoutSec)

	runnerFile := filepath.Join(tmpDir, "runner.py")
	if err := os.WriteFile(runnerFile, []byte(runnerScript), 0644); err != nil {
		return nil, fmt.Errorf("failed to write runner script: %w", err)
	}

	// Create command with timeout
	timeoutCtx, cancel := context.WithTimeout(ctx, time.Duration(fn.TimeoutSec)*time.Second)
	defer cancel()

	// Try python3 first, fall back to python
	pythonCmd := "python3"
	if _, err := exec.LookPath("python3"); err != nil {
		pythonCmd = "python"
	}

	cmd := exec.CommandContext(timeoutCtx, pythonCmd, "runner.py")
	cmd.Dir = tmpDir

	// Set environment variables
	cmd.Env = os.Environ()
	for key, value := range fn.Environment {
		cmd.Env = append(cmd.Env, fmt.Sprintf("%s=%s", key, value))
	}

	// Run the command and capture output
	output, err := cmd.CombinedOutput()
	if err != nil {
		if timeoutCtx.Err() == context.DeadlineExceeded {
			return nil, fmt.Errorf("function execution timed out after %d seconds", fn.TimeoutSec)
		}
		return nil, fmt.Errorf("function execution failed: %s (output: %s)", err, string(output))
	}

	// Parse the output - find the last JSON line
	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	var result map[string]interface{}

	for i := len(lines) - 1; i >= 0; i-- {
		if err := json.Unmarshal([]byte(lines[i]), &result); err == nil {
			break
		}
	}

	if result == nil {
		// Return raw output if not JSON
		return string(output), nil
	}

	// Check for error
	if errMsg, ok := result["error"].(string); ok {
		return nil, fmt.Errorf("function error: %s", errMsg)
	}

	return result["body"], nil
}
