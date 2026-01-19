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

// executeDotNetLocal executes a C# function locally (without Firecracker)
// This is useful for development and testing
func executeDotNetLocal(ctx context.Context, fn *models.Function, code []byte, payload interface{}) (interface{}, error) {
	// Create a temporary directory for the function
	tmpDir, err := os.MkdirTemp("", "impuls-dotnet-function-*")
	if err != nil {
		return nil, fmt.Errorf("failed to create temp directory: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	// Parse handler (format: "Namespace.Class.Method")
	handlerParts := strings.Split(fn.Handler, ".")
	if len(handlerParts) < 2 {
		return nil, fmt.Errorf("invalid handler format: %s (expected 'Class.Method' or 'Namespace.Class.Method')", fn.Handler)
	}

	className := strings.Join(handlerParts[:len(handlerParts)-1], ".")
	methodName := handlerParts[len(handlerParts)-1]

	// Serialize the payload
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}

	// Create the project file
	csprojContent := `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="System.Text.Json" Version="8.0.0" />
  </ItemGroup>
</Project>`

	csprojFile := filepath.Join(tmpDir, "Function.csproj")
	if err := os.WriteFile(csprojFile, []byte(csprojContent), 0644); err != nil {
		return nil, fmt.Errorf("failed to write csproj file: %w", err)
	}

	// Write the function code
	functionFile := filepath.Join(tmpDir, "Function.cs")
	if err := os.WriteFile(functionFile, code, 0644); err != nil {
		return nil, fmt.Errorf("failed to write function code: %w", err)
	}

	// Create the runner program
	runnerCode := fmt.Sprintf(`
using System;
using System.Text.Json;
using System.Threading.Tasks;

public class LambdaContext
{
    public string FunctionName { get; set; } = "%s";
    public string FunctionVersion { get; set; } = "1";
    public int MemoryLimitInMB { get; set; } = %d;
    private DateTime _startTime = DateTime.UtcNow;
    private int _timeoutSec = %d;

    public int GetRemainingTimeInMillis()
    {
        var elapsed = (DateTime.UtcNow - _startTime).TotalSeconds;
        return Math.Max(0, (int)((_timeoutSec - elapsed) * 1000));
    }
}

public static class Runner
{
    public static async Task Main()
    {
        try
        {
            var eventJson = @"%s";
            var eventData = JsonSerializer.Deserialize<JsonElement>(eventJson);
            var context = new LambdaContext();

            var handlerType = typeof(%s);
            var instance = Activator.CreateInstance(handlerType);
            var method = handlerType.GetMethod("%s");
            
            if (method == null)
            {
                Console.WriteLine(JsonSerializer.Serialize(new { statusCode = 500, error = "Method not found" }));
                return;
            }

            object? result;
            var parameters = method.GetParameters();
            
            if (parameters.Length == 0)
                result = method.Invoke(instance, null);
            else if (parameters.Length == 1)
                result = method.Invoke(instance, new object?[] { eventData });
            else
                result = method.Invoke(instance, new object?[] { eventData, context });

            if (result is Task task)
            {
                await task;
                var resultProperty = task.GetType().GetProperty("Result");
                result = resultProperty?.GetValue(task);
            }

            Console.WriteLine(JsonSerializer.Serialize(new { statusCode = 200, body = result }));
        }
        catch (Exception ex)
        {
            Console.WriteLine(JsonSerializer.Serialize(new { 
                statusCode = 500, 
                error = ex.InnerException?.Message ?? ex.Message,
                stack = ex.StackTrace 
            }));
        }
    }
}
`, fn.Name, fn.MemoryMB, fn.TimeoutSec, escapeForCSharp(string(payloadJSON)), className, methodName)

	runnerFile := filepath.Join(tmpDir, "Runner.cs")
	if err := os.WriteFile(runnerFile, []byte(runnerCode), 0644); err != nil {
		return nil, fmt.Errorf("failed to write runner code: %w", err)
	}

	// Create command with timeout
	timeoutCtx, cancel := context.WithTimeout(ctx, time.Duration(fn.TimeoutSec)*time.Second+30*time.Second) // Extra time for compilation
	defer cancel()

	// Build the project
	buildCmd := exec.CommandContext(timeoutCtx, "dotnet", "build", "-c", "Release", "-o", "bin")
	buildCmd.Dir = tmpDir
	buildCmd.Env = os.Environ()

	buildOutput, err := buildCmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("failed to build function: %s (output: %s)", err, string(buildOutput))
	}

	// Run the compiled program
	runCmd := exec.CommandContext(timeoutCtx, "dotnet", filepath.Join("bin", "Function.dll"))
	runCmd.Dir = tmpDir

	// Set environment variables
	runCmd.Env = os.Environ()
	for key, value := range fn.Environment {
		runCmd.Env = append(runCmd.Env, fmt.Sprintf("%s=%s", key, value))
	}

	// Run the command and capture output
	output, err := runCmd.CombinedOutput()
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

// escapeForCSharp escapes a string for use in a C# verbatim string literal
func escapeForCSharp(s string) string {
	return strings.ReplaceAll(s, `"`, `""`)
}
