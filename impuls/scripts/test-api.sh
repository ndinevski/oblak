#!/bin/bash
# Test script - create and invoke a function

set -e

BASE_URL="${BASE_URL:-http://localhost:8080}"
API_URL="${BASE_URL}/api/v1"

echo "=== Testing Impuls API ==="
echo "API URL: ${API_URL}"
echo ""

# Test health endpoint
echo "1. Testing health endpoint..."
curl -s "${BASE_URL}/health" | jq .
echo ""

# Create a function
echo "2. Creating function 'hello-world'..."
curl -s -X POST "${API_URL}/functions" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "hello-world",
        "runtime": "nodejs20",
        "handler": "index.handler",
        "code": "exports.handler = async (event, context) => { return { message: \"Hello, \" + (event.name || \"World\") + \"!\", timestamp: new Date().toISOString() }; }"
    }' | jq .
echo ""

# List functions
echo "3. Listing functions..."
curl -s "${API_URL}/functions" | jq .
echo ""

# Get function
echo "4. Getting function 'hello-world'..."
curl -s "${API_URL}/functions/hello-world" | jq .
echo ""

# Invoke function (local mode for testing without Firecracker)
echo "5. Invoking function (local mode)..."
curl -s -X POST "${API_URL}/functions/hello-world/invoke?local=true" \
    -H "Content-Type: application/json" \
    -d '{"name": "Impuls User"}' | jq .
echo ""

# Update function
echo "6. Updating function..."
curl -s -X PUT "${API_URL}/functions/hello-world" \
    -H "Content-Type: application/json" \
    -d '{
        "code": "exports.handler = async (event, context) => { return { message: \"Updated: Hello, \" + (event.name || \"World\") + \"!\", version: 2 }; }"
    }' | jq .
echo ""

# Invoke updated function
echo "7. Invoking updated function..."
curl -s -X POST "${API_URL}/functions/hello-world/invoke?local=true" \
    -H "Content-Type: application/json" \
    -d '{"name": "Updated User"}' | jq .
echo ""

# Create another function with environment variables
echo "8. Creating function with environment variables..."
curl -s -X POST "${API_URL}/functions" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "env-test",
        "runtime": "nodejs20",
        "handler": "index.handler",
        "code": "exports.handler = async (event) => { return { secret: process.env.MY_SECRET, apiKey: process.env.API_KEY }; }",
        "environment": {
            "MY_SECRET": "super-secret-value",
            "API_KEY": "test-api-key-12345"
        }
    }' | jq .
echo ""

# Invoke env function
echo "9. Invoking env-test function..."
curl -s -X POST "${API_URL}/functions/env-test/invoke?local=true" \
    -H "Content-Type: application/json" \
    -d '{}' | jq .
echo ""

# Delete function
echo "10. Deleting function 'env-test'..."
curl -s -X DELETE "${API_URL}/functions/env-test" | jq .
echo ""

# Final list
echo "11. Final function list..."
curl -s "${API_URL}/functions" | jq .
echo ""

echo "=== Tests Complete ==="
