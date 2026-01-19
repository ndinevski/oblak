# Adding New Runtimes

This guide explains how to add support for additional programming languages to Impuls.

## Currently Supported Runtimes

| Runtime | Language | Version |
|---------|----------|---------|
| `nodejs20` | Node.js | 20.x |
| `nodejs18` | Node.js | 18.x |
| `python312` | Python | 3.12.x |
| `python311` | Python | 3.11.x |
| `dotnet8` | C# / .NET | 8.0 |
| `dotnet7` | C# / .NET | 7.0 |

## Runtime Structure

Each runtime consists of:

1. **Runtime files** in `runtimes/{language}/`
2. **Runtime constant** in `internal/models/function.go`
3. **Local executor** in `internal/function/executor_{language}.go`
4. **Rootfs with language support** in `images/`

## Directory Structure

```
runtimes/
├── nodejs/
│   ├── runtime.js       # HTTP server that executes functions
│   ├── package.json     # Dependencies
│   └── bootstrap.sh     # Startup script for VM
├── python/
│   ├── runtime.py       # Python HTTP server
│   ├── requirements.txt # Dependencies
│   └── bootstrap.sh     # Startup script for VM
└── dotnet/
    ├── Program.cs       # .NET HTTP server
    ├── ImpulsRuntime.csproj
    └── bootstrap.sh     # Startup script for VM
```

## Step 1: Add Runtime Constant

Edit `internal/models/function.go`:

```go
const (
    RuntimeNodeJS20  Runtime = "nodejs20"
    RuntimeNodeJS18  Runtime = "nodejs18"
    RuntimePython312 Runtime = "python312"
    RuntimePython311 Runtime = "python311"
    RuntimeDotNet8   Runtime = "dotnet8"
    RuntimeDotNet7   Runtime = "dotnet7"
    RuntimeNewLang   Runtime = "newlang"  // Add new runtime
)

func isValidRuntime(r Runtime) bool {
    switch r {
    case RuntimeNodeJS20, RuntimeNodeJS18,
        RuntimePython312, RuntimePython311,
        RuntimeDotNet8, RuntimeDotNet7,
        RuntimeNewLang:
        return true
    default:
        return false
    }
}

// Update GetRuntimeLanguage to return the base language
func GetRuntimeLanguage(r Runtime) string {
    switch r {
    case RuntimeNodeJS20, RuntimeNodeJS18:
        return "nodejs"
    case RuntimePython312, RuntimePython311:
        return "python"
    case RuntimeDotNet8, RuntimeDotNet7:
        return "dotnet"
    case RuntimeNewLang:
        return "newlang"
    default:
        return ""
    }
}
```

## Step 2: Create Runtime Files

### Example: Python Runtime

The Python runtime (`runtimes/python/runtime.py`) is an HTTP server that:
1. Listens for invocation requests on `/invoke`
2. Dynamically loads and executes function code
3. Returns the result as JSON

```python
#!/usr/bin/env python3
"""
Impuls Function Runtime - Python
"""

import json
import http.server
import sys
import traceback

PORT = int(os.environ.get('RUNTIME_PORT', 8080))

class RuntimeHandler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/invoke':
            self.handle_invoke()
        else:
            self.send_error(404)
    
    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'status': 'healthy',
                'runtime': 'python',
                'version': sys.version
            }).encode())
        else:
            self.send_error(404)
        start_time = time.time()
        
        # Read request body
        content_length = int(self.headers['Content-Length'])
        body = self.rfile.read(content_length).decode()
        payload = json.loads(body)
        
        code = payload.get('code', '')
        handler_name = payload.get('handler', 'handler')
        event = payload.get('event', {})
        env = payload.get('env', {})
        
        # Set environment variables
        for key, value in env.items():
            os.environ[key] = value
        
        # Capture stdout/stderr
        old_stdout = sys.stdout
        old_stderr = sys.stderr
        sys.stdout = StringIO()
        sys.stderr = StringIO()
        
        try:
            # Execute code
            namespace = {}
            exec(code, namespace)
            
            # Get handler
            handler_parts = handler_name.split('.')
            handler_fn = namespace.get(handler_parts[-1])
            
            if not callable(handler_fn):
                raise ValueError(f"Handler '{handler_name}' is not callable")
            
            # Create context
            context = {
                'function_name': payload.get('function_name', 'anonymous'),
                'memory_limit_in_mb': payload.get('memory_mb', 128),
            }
            
            # Execute handler
            result = handler_fn(event, context)
            
            # Get logs
            logs = sys.stdout.getvalue() + sys.stderr.getvalue()
            
            response = {
                'statusCode': 200,
                'body': result,
                'duration_ms': int((time.time() - start_time) * 1000),
                'logs': logs
            }
            
        except Exception as e:
            logs = sys.stdout.getvalue() + sys.stderr.getvalue()
            response = {
                'statusCode': 500,
                'error': str(e),
                'stack': traceback.format_exc(),
                'duration_ms': int((time.time() - start_time) * 1000),
                'logs': logs
            }
        
        finally:
            sys.stdout = old_stdout
            sys.stderr = old_stderr
        
        # Send response
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(response).encode())

if __name__ == '__main__':
    with socketserver.TCPServer(('0.0.0.0', PORT), InvocationHandler) as httpd:
        print(f'Impuls Python runtime listening on port {PORT}')
        httpd.serve_forever()
```

Create `runtimes/python/bootstrap.sh`:

```bash
#!/bin/bash
cd /var/runtime
exec python3 runtime.py
```

## Step 3: Create Rootfs Image

### Option A: Extend Existing Rootfs

```bash
# Copy base rootfs
cp images/rootfs.ext4 images/python-rootfs.ext4

# Mount and add Python
sudo mount -o loop images/python-rootfs.ext4 /mnt
sudo chroot /mnt apt-get update
sudo chroot /mnt apt-get install -y python3 python3-pip
sudo cp runtimes/python/* /mnt/var/runtime/
sudo umount /mnt
```

### Option B: Use Docker

```bash
docker run --rm -v $(pwd)/images:/output alpine sh -c '
    apk add --no-cache python3 py3-pip
    # Create rootfs tar
    tar -cf /output/python-rootfs.tar /
'
```

## Step 4: Add Local Executor (Optional)

For development without Firecracker, add a local executor in `internal/function/executor.go`:

```go
func executePythonLocal(ctx context.Context, fn *models.Function, code []byte, payload interface{}) (interface{}, error) {
    // Similar to executeNodeJSLocal but for Python
    tmpDir, err := os.MkdirTemp("", "impuls-function-*")
    if err != nil {
        return nil, err
    }
    defer os.RemoveAll(tmpDir)

    // Write function code
    functionFile := filepath.Join(tmpDir, "function.py")
    os.WriteFile(functionFile, code, 0644)

    // Create runner script
    // ... (similar pattern to Node.js)

    cmd := exec.CommandContext(ctx, "python3", "runner.py")
    cmd.Dir = tmpDir
    
    // Execute and return result
    output, err := cmd.CombinedOutput()
    // ... parse output
}
```

## Step 5: Update Function Manager

Edit `internal/function/manager.go` to handle the new runtime:

```go
func (m *Manager) InvokeLocal(ctx context.Context, name string, payload interface{}) (*models.InvocationResponse, error) {
    // ... get function ...
    
    switch fn.Runtime {
    case models.RuntimeNodeJS20, models.RuntimeNodeJS18:
        result, err = executeNodeJSLocal(ctx, fn, code, payload)
    case models.RuntimePython39, models.RuntimePython311:
        result, err = executePythonLocal(ctx, fn, code, payload)
    default:
        return nil, fmt.Errorf("unsupported runtime: %s", fn.Runtime)
    }
    
    // ...
}
```

## Handler Conventions

### Python Handler Format

```python
def handler(event, context):
    """
    event: dict - The invocation payload
    context: dict - Execution context
    
    Returns: Any JSON-serializable value
    """
    return {
        'message': f"Hello, {event.get('name', 'World')}!"
    }
```

### Go Handler Format

```go
package main

import (
    "context"
)

func Handler(ctx context.Context, event map[string]interface{}) (interface{}, error) {
    name := "World"
    if n, ok := event["name"].(string); ok {
        name = n
    }
    return map[string]string{
        "message": "Hello, " + name + "!",
    }, nil
}
```

## Testing New Runtime

1. Build the project:
   ```bash
   ./scripts/build.sh
   ```

2. Create a function with the new runtime:
   ```bash
   curl -X POST http://localhost:8080/api/v1/functions \
     -H "Content-Type: application/json" \
     -d '{
       "name": "python-test",
       "runtime": "python39",
       "handler": "handler",
       "code": "def handler(event, context):\n    return {\"message\": \"Hello from Python!\"}"
     }'
   ```

3. Invoke the function:
   ```bash
   curl -X POST http://localhost:8080/api/v1/functions/python-test/invoke?local=true \
     -H "Content-Type: application/json" \
     -d '{}'
   ```

## Checklist for New Runtime

- [ ] Add runtime constant to `models/function.go`
- [ ] Update `isValidRuntime()` function
- [ ] Create `runtimes/{language}/runtime.*`
- [ ] Create `runtimes/{language}/bootstrap.sh`
- [ ] Create rootfs image with language installed
- [ ] (Optional) Add local executor for development
- [ ] Update documentation
- [ ] Add tests
