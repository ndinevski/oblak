#!/usr/bin/env node

/**
 * Impuls Function Runtime - Node.js
 * 
 * This is the runtime that executes inside the Firecracker VM.
 * It receives function invocations via HTTP and executes the handler.
 */

const http = require('http');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const PORT = process.env.RUNTIME_PORT || 8080;
const FUNCTION_DIR = process.env.FUNCTION_DIR || '/var/task';

// Function cache
let cachedHandler = null;
let cachedCode = null;

/**
 * Load and compile the function code
 */
function loadFunction(code, handler) {
    if (cachedCode === code && cachedHandler) {
        return cachedHandler;
    }

    // Create a sandbox environment
    const sandbox = {
        module: { exports: {} },
        exports: {},
        require: require,
        console: console,
        process: process,
        Buffer: Buffer,
        setTimeout: setTimeout,
        setInterval: setInterval,
        setImmediate: setImmediate,
        clearTimeout: clearTimeout,
        clearInterval: clearInterval,
        clearImmediate: clearImmediate,
        __dirname: FUNCTION_DIR,
        __filename: path.join(FUNCTION_DIR, 'function.js'),
    };
    sandbox.exports = sandbox.module.exports;

    // Compile and run the code
    try {
        const script = new vm.Script(code, {
            filename: 'function.js',
            displayErrors: true,
        });

        const context = vm.createContext(sandbox);
        script.runInContext(context);

        // Get the handler function
        const handlerParts = handler.split('.');
        const handlerName = handlerParts[handlerParts.length - 1];

        const handlerFn = sandbox.module.exports[handlerName] || sandbox.exports[handlerName];

        if (typeof handlerFn !== 'function') {
            throw new Error(`Handler '${handlerName}' is not a function`);
        }

        cachedCode = code;
        cachedHandler = handlerFn;

        return handlerFn;
    } catch (err) {
        throw new Error(`Failed to load function: ${err.message}`);
    }
}

/**
 * Execute the function handler
 */
async function executeHandler(handler, event, context) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Function execution timed out'));
        }, context.getRemainingTimeInMillis());

        try {
            // Check handler signature
            if (handler.length <= 2) {
                // Async handler (event, context) => Promise
                Promise.resolve(handler(event, context))
                    .then(result => {
                        clearTimeout(timeout);
                        resolve(result);
                    })
                    .catch(err => {
                        clearTimeout(timeout);
                        reject(err);
                    });
            } else {
                // Callback handler (event, context, callback) => void
                handler(event, context, (err, result) => {
                    clearTimeout(timeout);
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                });
            }
        } catch (err) {
            clearTimeout(timeout);
            reject(err);
        }
    });
}

/**
 * Create Lambda-like context object
 */
function createContext(functionName, timeoutMs, memoryMB) {
    const startTime = Date.now();
    const requestId = generateRequestId();

    return {
        functionName: functionName,
        functionVersion: '$LATEST',
        invokedFunctionArn: `arn:impuls:function:${functionName}`,
        memoryLimitInMB: memoryMB,
        awsRequestId: requestId,
        logGroupName: `/impuls/${functionName}`,
        logStreamName: `${new Date().toISOString().split('T')[0]}/${requestId}`,
        callbackWaitsForEmptyEventLoop: true,
        getRemainingTimeInMillis: () => {
            return Math.max(0, timeoutMs - (Date.now() - startTime));
        },
        done: (err, result) => {
            // Legacy callback
        },
        fail: (err) => {
            // Legacy callback
        },
        succeed: (result) => {
            // Legacy callback
        },
    };
}

/**
 * Generate a request ID
 */
function generateRequestId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/**
 * Handle function invocation request
 */
async function handleInvoke(req, res) {
    let body = '';

    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', async () => {
        const startTime = Date.now();
        let logs = [];

        // Capture console output
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;

        console.log = (...args) => {
            logs.push({ level: 'info', message: args.join(' ') });
            originalLog.apply(console, args);
        };
        console.error = (...args) => {
            logs.push({ level: 'error', message: args.join(' ') });
            originalError.apply(console, args);
        };
        console.warn = (...args) => {
            logs.push({ level: 'warn', message: args.join(' ') });
            originalWarn.apply(console, args);
        };

        try {
            const payload = JSON.parse(body);
            const { code, handler, event, env, timeout_ms, memory_mb, function_name } = payload;

            // Set environment variables
            if (env) {
                Object.entries(env).forEach(([key, value]) => {
                    process.env[key] = value;
                });
            }

            // Load the function
            const handlerFn = loadFunction(code, handler);

            // Create context
            const context = createContext(
                function_name || 'anonymous',
                timeout_ms || 30000,
                memory_mb || 128
            );

            // Execute the handler
            const result = await executeHandler(handlerFn, event, context);

            // Restore console
            console.log = originalLog;
            console.error = originalError;
            console.warn = originalWarn;

            // Send response
            const response = {
                statusCode: 200,
                body: result,
                duration_ms: Date.now() - startTime,
                logs: logs.map(l => `[${l.level.toUpperCase()}] ${l.message}`).join('\n'),
            };

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));

        } catch (err) {
            // Restore console
            console.log = originalLog;
            console.error = originalError;
            console.warn = originalWarn;

            const response = {
                statusCode: 500,
                error: err.message,
                stack: err.stack,
                duration_ms: Date.now() - startTime,
                logs: logs.map(l => `[${l.level.toUpperCase()}] ${l.message}`).join('\n'),
            };

            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));
        }
    });
}

/**
 * Health check handler
 */
function handleHealth(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        status: 'healthy',
        runtime: 'nodejs',
        version: process.version,
    }));
}

/**
 * Main HTTP server
 */
const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/invoke') {
        handleInvoke(req, res);
    } else if (req.method === 'GET' && req.url === '/health') {
        handleHealth(req, res);
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Impuls Node.js runtime listening on port ${PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down...');
    server.close(() => {
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down...');
    server.close(() => {
        process.exit(0);
    });
});
