package function

import (
	"bytes"
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

const logs = { stdout: [], stderr: [] };

const formatValue = (v) => {
	if (typeof v === 'string') return v;
	try { return JSON.stringify(v); } catch { return String(v); }
};

console.log = (...args) => {
	logs.stdout.push(args.map(formatValue).join(' '));
};

console.error = (...args) => {
	logs.stderr.push(args.map(formatValue).join(' '));
};

// Load the function
const fn = require('./function.js');

// Get the handler
const handler = fn['%s'];
if (typeof handler !== 'function') {
	process.stdout.write(JSON.stringify({ ok: false, error: 'Handler %s is not a function', logs }) + '\n');
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
		process.stdout.write(JSON.stringify({ ok: true, result, logs }) + '\n');
    } catch (err) {
		process.stdout.write(JSON.stringify({
			ok: false,
			error: err.message,
			stack: err.stack,
			logs,
		}) + '\n');
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
	var stdoutBuf bytes.Buffer
	var stderrBuf bytes.Buffer
	cmd.Stdout = &stdoutBuf
	cmd.Stderr = &stderrBuf

	err = cmd.Run()
	if err != nil {
		if timeoutCtx.Err() == context.DeadlineExceeded {
			return nil, fmt.Errorf("function execution timed out after %d seconds", fn.TimeoutSec)
		}
		return nil, fmt.Errorf("function execution failed: %s (stderr: %s)", err, strings.TrimSpace(stderrBuf.String()))
	}

	// Parse runner envelope
	stdout := strings.TrimSpace(stdoutBuf.String())
	var envelope map[string]interface{}
	if err := json.Unmarshal([]byte(stdout), &envelope); err != nil {
		// Return raw output if not JSON
		return map[string]interface{}{
			"__impuls_response": stdout,
			"__impuls_logs": map[string]interface{}{
				"stdout": []string{},
				"stderr": splitNonEmptyLines(stderrBuf.String()),
			},
		}, nil
	}

	if okVal, ok := envelope["ok"].(bool); ok && !okVal {
		errMsg, _ := envelope["error"].(string)
		if errMsg == "" {
			errMsg = "unknown function error"
		}
		return nil, fmt.Errorf("function error: %s", errMsg)
	}

	logs, _ := envelope["logs"].(map[string]interface{})
	stderrLines := splitNonEmptyLines(stderrBuf.String())
	if logs != nil {
		if existing, ok := logs["stderr"].([]interface{}); ok {
			for _, line := range stderrLines {
				existing = append(existing, line)
			}
			logs["stderr"] = existing
		}
	}

	return map[string]interface{}{
		"__impuls_response": envelope["result"],
		"__impuls_logs":     logs,
	}, nil
}

func splitNonEmptyLines(input string) []string {
	lines := strings.Split(strings.ReplaceAll(input, "\r\n", "\n"), "\n")
	result := make([]string, 0, len(lines))
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}
