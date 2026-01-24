#!/bin/bash

# Test Izvor API endpoints

set -e

API_URL="${API_URL:-http://localhost:8082}"

echo "Testing Izvor API at $API_URL"
echo "================================"

# Health check
echo -e "\n1. Health Check"
curl -s "$API_URL/health" | jq .

# List VM sizes
echo -e "\n2. List VM Sizes"
curl -s "$API_URL/api/v1/vms/sizes" | jq .

# List nodes
echo -e "\n3. List Nodes"
curl -s "$API_URL/api/v1/nodes" | jq .

# List VMs
echo -e "\n4. List VMs"
curl -s "$API_URL/api/v1/vms" | jq .

# List templates
echo -e "\n5. List Templates"
curl -s "$API_URL/api/v1/templates" | jq .

# Cluster status
echo -e "\n6. Cluster Status"
curl -s "$API_URL/api/v1/cluster/status" | jq .

# Cluster resources
echo -e "\n7. Cluster Resources"
curl -s "$API_URL/api/v1/cluster/resources" | jq .

# Storage
echo -e "\n8. List Storage"
curl -s "$API_URL/api/v1/storage" | jq .

echo -e "\n================================"
echo "API tests completed!"
