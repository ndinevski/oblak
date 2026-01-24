#!/bin/bash

# Create a VM using the Izvor API

set -e

API_URL="${API_URL:-http://localhost:8082}"

# Parse arguments
VM_NAME="${1:-test-vm}"
TEMPLATE="${2:-ubuntu-22.04}"
SIZE="${3:-small}"

echo "Creating VM..."
echo "  Name: $VM_NAME"
echo "  Template: $TEMPLATE"
echo "  Size: $SIZE"
echo ""

response=$(curl -s -X POST "$API_URL/api/v1/vms" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$VM_NAME\",
    \"template\": \"$TEMPLATE\",
    \"size\": \"$SIZE\",
    \"cloud_init\": {
      \"user\": \"admin\",
      \"ip_config\": \"ip=dhcp\"
    },
    \"start_on_create\": true
  }")

echo "$response" | jq .

vmid=$(echo "$response" | jq -r '.vmid // empty')

if [ -n "$vmid" ]; then
    echo ""
    echo "VM created successfully!"
    echo "  VMID: $vmid"
    echo ""
    echo "Useful commands:"
    echo "  Get VM:    curl $API_URL/api/v1/vms/$vmid"
    echo "  Stop VM:   curl -X POST $API_URL/api/v1/vms/$vmid/actions -d '{\"action\":\"stop\"}' -H 'Content-Type: application/json'"
    echo "  Delete VM: curl -X DELETE $API_URL/api/v1/vms/$vmid"
else
    echo ""
    echo "Failed to create VM. Check the error above."
    exit 1
fi
