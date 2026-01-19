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

// executeNodeJSLocal executes a Node.js function locally (without Firecracker)
// This is useful for development and testing
func executeNodeJSLocal(ctx context.Context, fn *models.Function, code []byte, payload interface{}) (interface{}, error) {
	// Create a temporary directory for the function
	tmpDir, err := os.MkdirTemp("", "impuls-function-*")
	if err != nil {
		return nil, fmt.Errorf("failed to create temp directory: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	// Write the function code
	functionFile := filepath.Join(tmpDir, "function.js")
	if err := os.WriteFile(functionFile, code, 0644); err != nil {
		return nil, fmt.Errorf("failed to write function code: %w", err)
	}

	// Parse handler (format: "filename.handlerFunction")
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
const path = require('path');

// Load the function
const fn = require('./function.js');

// Get the handler
const handler = fn['%s'];
if (typeof handler !== 'function') {
    console.error(JSON.stringify({ error: 'Handler %s is not a function' }));
    process.exit(1);
}

// Parse the event
const event = %s;

// Context object (simplified Lambda context)
const context = {
    functionName: '%s',
    functionVersion: '1',
    memoryLimitInMB: %d,
    getRemainingTimeInMillis: () => %d * 1000,
    callbackWaitsForEmptyEventLoop: false,
};

// Execute the handler
async function run() {
    try {
        let result;
        if (handler.length <= 2) {
            // Async handler (event, context) => Promise
            result = await handler(event, context);
        } else {
            // Callback handler (event, context, callback) => void
            result = await new Promise((resolve, reject) => {
                handler(event, context, (err, res) => {
                    if (err) reject(err);
                    else resolve(res);
                });
            });
        }
        console.log(JSON.stringify({ statusCode: 200, body: result }));
    } catch (err) {
        console.log(JSON.stringify({ 
            statusCode: 500, 
            error: err.message,
            stack: err.stack 
        }));
    }
}

run();
`, handlerFunction, handlerFunction, string(payloadJSON), fn.Name, fn.MemoryMB, fn.TimeoutSec)

	runnerFile := filepath.Join(tmpDir, "runner.js")
	if err := os.WriteFile(runnerFile, []byte(runnerScript), 0644); err != nil {
		return nil, fmt.Errorf("failed to write runner script: %w", err)
	}

	// Create command with timeout
	timeoutCtx, cancel := context.WithTimeout(ctx, time.Duration(fn.TimeoutSec)*time.Second)
	defer cancel()

	cmd := exec.CommandContext(timeoutCtx, "node", "runner.js")
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

	// Parse the output
	var result map[string]interface{}
	if err := json.Unmarshal(output, &result); err != nil {
		// Return raw output if not JSON
		return string(output), nil
	}

	// Check for error
	if errMsg, ok := result["error"].(string); ok {
		return nil, fmt.Errorf("function error: %s", errMsg)
	}

	return result["body"], nil
}
