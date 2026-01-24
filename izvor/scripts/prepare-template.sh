#!/bin/bash

# Prepare a cloud-init template in Proxmox
# Run this on your Proxmox node

set -e

# Configuration
VMID="${1:-9000}"
NAME="${2:-ubuntu-22.04}"
IMAGE_URL="${3:-https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img}"
STORAGE="${STORAGE:-local-lvm}"
BRIDGE="${BRIDGE:-vmbr0}"

echo "Preparing VM template..."
echo "  VMID: $VMID"
echo "  Name: $NAME"
echo "  Image: $IMAGE_URL"
echo "  Storage: $STORAGE"
echo ""

# Download image
TEMP_DIR="/tmp/izvor-templates"
mkdir -p "$TEMP_DIR"
IMAGE_FILE="$TEMP_DIR/$(basename "$IMAGE_URL")"

if [ ! -f "$IMAGE_FILE" ]; then
    echo "Downloading cloud image..."
    wget -O "$IMAGE_FILE" "$IMAGE_URL"
else
    echo "Using cached image: $IMAGE_FILE"
fi

# Create VM
echo "Creating VM $VMID..."
qm create "$VMID" \
    --name "$NAME" \
    --memory 2048 \
    --cores 2 \
    --net0 "virtio,bridge=$BRIDGE" \
    --ostype l26

# Import disk
echo "Importing disk..."
qm importdisk "$VMID" "$IMAGE_FILE" "$STORAGE"

# Configure VM
echo "Configuring VM..."
qm set "$VMID" \
    --scsihw virtio-scsi-pci \
    --scsi0 "$STORAGE:vm-$VMID-disk-0" \
    --ide2 "$STORAGE:cloudinit" \
    --boot order=scsi0 \
    --serial0 socket \
    --vga serial0 \
    --agent enabled=1

# Convert to template
echo "Converting to template..."
qm template "$VMID"

echo ""
echo "Template created successfully!"
echo "  VMID: $VMID"
echo "  Name: $NAME"
echo ""
echo "You can now create VMs from this template using Izvor API:"
echo "  curl -X POST http://localhost:8082/api/v1/vms \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"name\": \"my-vm\", \"template\": \"$VMID\", \"size\": \"medium\"}'"
