#!/usr/bin/env python3
"""
Impuls Function Runtime - Python

This is the runtime that executes inside the Firecracker VM.
It receives function invocations via HTTP and executes the handler.
"""

import http.server
import json
import os
import sys
import traceback
import importlib.util
import time
from typing import Any, Callable, Dict, Optional

PORT = int(os.environ.get('RUNTIME_PORT', 8080))
FUNCTION_DIR = os.environ.get('FUNCTION_DIR', '/var/task')

# Function cache
cached_handler: Optional[Callable] = None
cached_code: Optional[str] = None


class LambdaContext:
    """Simplified AWS Lambda-like context object"""
    
    def __init__(self, function_name: str, memory_mb: int, timeout_sec: int):
        self.function_name = function_name
        self.function_version = '1'
        self.memory_limit_in_mb = memory_mb
        self._timeout_sec = timeout_sec
        self._start_time = time.time()
    
    def get_remaining_time_in_millis(self) -> int:
        elapsed = time.time() - self._start_time
        remaining = max(0, (self._timeout_sec - elapsed) * 1000)
        return int(remaining)


def load_function(code: str, handler: str) -> Callable:
    """Load and compile the function code"""
    global cached_handler, cached_code
    
    if cached_code == code and cached_handler is not None:
        return cached_handler
    
    # Parse handler (format: "module.function_name")
    handler_parts = handler.rsplit('.', 1)
    if len(handler_parts) != 2:
        raise ValueError(f"Invalid handler format: {handler} (expected 'module.function')")
    
    handler_function = handler_parts[1]
    
    # Create a temporary module from the code
    function_path = os.path.join(FUNCTION_DIR, 'function.py')
    
    # Write the code to a file
    os.makedirs(FUNCTION_DIR, exist_ok=True)
    with open(function_path, 'w') as f:
        f.write(code)
    
    # Load the module
    spec = importlib.util.spec_from_file_location('function', function_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Failed to load function module")
    
    module = importlib.util.module_from_spec(spec)
    sys.modules['function'] = module
    spec.loader.exec_module(module)
    
    # Get the handler function
    if not hasattr(module, handler_function):
        raise ValueError(f"Handler '{handler_function}' not found in module")
    
    handler_fn = getattr(module, handler_function)
    
    if not callable(handler_fn):
        raise ValueError(f"Handler '{handler_function}' is not callable")
    
    cached_code = code
    cached_handler = handler_fn
    
    return handler_fn


async def execute_handler_async(handler: Callable, event: Any, context: LambdaContext) -> Any:
    """Execute an async handler"""
    import asyncio
    
    if asyncio.iscoroutinefunction(handler):
        return await handler(event, context)
    else:
        return handler(event, context)


def execute_handler(handler: Callable, event: Any, context: LambdaContext) -> Any:
    """Execute the function handler"""
    import asyncio
    
    if asyncio.iscoroutinefunction(handler):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(execute_handler_async(handler, event, context))
        finally:
            loop.close()
    else:
        return handler(event, context)


class RuntimeHandler(http.server.BaseHTTPRequestHandler):
    """HTTP request handler for the runtime"""
    
    def log_message(self, format: str, *args) -> None:
        """Suppress default logging"""
        pass
    
    def do_GET(self):
        """Health check endpoint"""
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'healthy', 'runtime': 'python'}).encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def do_POST(self):
        """Handle function invocation"""
        if self.path != '/invoke':
            self.send_response(404)
            self.end_headers()
            return
        
        try:
            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            request = json.loads(body.decode('utf-8'))
            
            # Extract invocation data
            code = request.get('code', '')
            handler_name = request.get('handler', 'handler.handler')
            event = request.get('event', {})
            env = request.get('env', {})
            function_name = request.get('function_name', 'unknown')
            memory_mb = request.get('memory_mb', 128)
            timeout_sec = request.get('timeout_sec', 30)
            
            # Set environment variables
            for key, value in env.items():
                os.environ[key] = value
            
            # Load the function
            handler = load_function(code, handler_name)
            
            # Create context
            context = LambdaContext(function_name, memory_mb, timeout_sec)
            
            # Execute the handler
            result = execute_handler(handler, event, context)
            
            # Send response
            response = {
                'statusCode': 200,
                'body': result
            }
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response).encode())
            
        except Exception as e:
            error_response = {
                'statusCode': 500,
                'error': str(e),
                'stack': traceback.format_exc()
            }
            
            self.send_response(200)  # Still 200, error in body
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(error_response).encode())


def main():
    """Start the runtime server"""
    server = http.server.HTTPServer(('0.0.0.0', PORT), RuntimeHandler)
    print(f"Python runtime listening on port {PORT}", file=sys.stderr)
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
