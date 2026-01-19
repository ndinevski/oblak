#!/bin/bash
# Bootstrap script for the Node.js runtime
# This runs when the VM starts

set -e

# Configure network (if using static IP)
if [ -n "$GUEST_IP" ]; then
    ip addr add "${GUEST_IP}/30" dev eth0
    ip link set eth0 up
    ip route add default via "${GATEWAY_IP}"
fi

# Start the runtime
cd /var/runtime
exec node runtime.js
