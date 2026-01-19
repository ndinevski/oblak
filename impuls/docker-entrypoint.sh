#!/bin/bash
set -e

DATA_DIR="${DATA_DIR:-/var/lib/impuls}"
IMAGES_DIR="${DATA_DIR}/images"
KERNEL_PATH="${IMAGES_DIR}/vmlinux"
ROOTFS_PATH="${IMAGES_DIR}/rootfs.ext4"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Impuls FaaS Server ===${NC}"
echo ""

# Check for KVM support
check_kvm() {
    if [ -e /dev/kvm ]; then
        if [ -r /dev/kvm ] && [ -w /dev/kvm ]; then
            echo -e "${GREEN}✓ KVM device is available and accessible${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠ KVM device exists but is not accessible${NC}"
            echo "  Trying to fix permissions..."
            chmod 666 /dev/kvm 2>/dev/null || true
            if [ -r /dev/kvm ] && [ -w /dev/kvm ]; then
                echo -e "${GREEN}✓ KVM permissions fixed${NC}"
                return 0
            fi
        fi
    fi
    
    echo -e "${YELLOW}⚠ KVM not available - running in local mode${NC}"
    echo "  Functions will execute locally without Firecracker VM isolation"
    echo "  To enable Firecracker, ensure KVM is available on the host"
    echo ""
    return 1
}

# Download kernel if not present
download_kernel() {
    if [ -f "$KERNEL_PATH" ]; then
        echo -e "${GREEN}✓ Kernel image found${NC}"
        return 0
    fi

    echo "Downloading kernel image..."
    mkdir -p "$IMAGES_DIR"
    
    KERNEL_URL="https://s3.amazonaws.com/spec.ccfc.min/img/quickstart_guide/x86_64/kernels/vmlinux.bin"
    if curl -fsSL -o "${KERNEL_PATH}" "${KERNEL_URL}"; then
        echo -e "${GREEN}✓ Kernel downloaded${NC}"
    else
        echo -e "${RED}✗ Failed to download kernel${NC}"
        return 1
    fi
}

# Download rootfs if not present
download_rootfs() {
    if [ -f "$ROOTFS_PATH" ]; then
        echo -e "${GREEN}✓ Rootfs image found${NC}"
        return 0
    fi

    echo "Downloading rootfs image (this may take a while)..."
    mkdir -p "$IMAGES_DIR"
    
    ROOTFS_URL="https://s3.amazonaws.com/spec.ccfc.min/img/quickstart_guide/x86_64/rootfs/bionic.rootfs.ext4"
    if curl -fsSL -o "${ROOTFS_PATH}" "${ROOTFS_URL}"; then
        echo -e "${GREEN}✓ Rootfs downloaded${NC}"
    else
        echo -e "${RED}✗ Failed to download rootfs${NC}"
        return 1
    fi
}

# Setup images
setup_images() {
    echo ""
    echo "Checking Firecracker images..."
    
    if ! download_kernel; then
        echo -e "${YELLOW}⚠ Kernel not available - Firecracker mode disabled${NC}"
        export IMPULS_LOCAL_MODE=true
    fi
    
    if ! download_rootfs; then
        echo -e "${YELLOW}⚠ Rootfs not available - Firecracker mode disabled${NC}"
        export IMPULS_LOCAL_MODE=true
    fi
}

# Main
echo "Checking system requirements..."
if check_kvm; then
    KVM_AVAILABLE=true
else
    KVM_AVAILABLE=false
fi

if [ "$KVM_AVAILABLE" = "true" ]; then
    setup_images
fi

echo ""
echo "Starting Impuls server..."

# Build command arguments
ARGS="--data-dir ${DATA_DIR}"

if [ "$KVM_AVAILABLE" = "false" ]; then
    echo -e "${YELLOW}Running in LOCAL MODE (no Firecracker)${NC}"
    echo "Add ?local=true to invoke URLs"
    echo ""
    ARGS="$ARGS --firecracker /dev/null"
else
    echo -e "${GREEN}Running in FIRECRACKER MODE${NC}"
    echo ""
    ARGS="$ARGS --firecracker /usr/local/bin/firecracker"
    ARGS="$ARGS --kernel ${KERNEL_PATH}"
    ARGS="$ARGS --rootfs ${ROOTFS_PATH}"
fi

# Add any passed arguments
ARGS="$ARGS $@"

echo "Command: /app/impuls-server $ARGS"
echo ""

exec /app/impuls-server $ARGS
