#!/bin/bash
# Setup kernel and rootfs images for Firecracker
# This script downloads pre-built images or builds them

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
IMAGES_DIR="${PROJECT_DIR}/images"
DATA_DIR="${DATA_DIR:-/var/lib/impuls}"

# Kernel version to use
KERNEL_VERSION="${KERNEL_VERSION:-5.10}"

echo "=== Setting up Firecracker Images ==="
echo "Images directory: ${IMAGES_DIR}"
echo ""

# Create directories
mkdir -p "${IMAGES_DIR}"
mkdir -p "${DATA_DIR}/images"

# Function to download kernel
download_kernel() {
    local KERNEL_URL="https://s3.amazonaws.com/spec.ccfc.min/img/quickstart_guide/x86_64/kernels/vmlinux.bin"
    local KERNEL_PATH="${IMAGES_DIR}/vmlinux"

    if [ -f "$KERNEL_PATH" ]; then
        echo "Kernel already exists at ${KERNEL_PATH}"
        return 0
    fi

    echo "Downloading kernel..."
    curl -fsSL -o "${KERNEL_PATH}" "${KERNEL_URL}"
    chmod 644 "${KERNEL_PATH}"
    echo "✓ Kernel downloaded to ${KERNEL_PATH}"
}

# Function to download rootfs
download_rootfs() {
    local ROOTFS_URL="https://s3.amazonaws.com/spec.ccfc.min/img/quickstart_guide/x86_64/rootfs/bionic.rootfs.ext4"
    local ROOTFS_PATH="${IMAGES_DIR}/rootfs.ext4"

    if [ -f "$ROOTFS_PATH" ]; then
        echo "Rootfs already exists at ${ROOTFS_PATH}"
        return 0
    fi

    echo "Downloading rootfs (this may take a while)..."
    curl -fsSL -o "${ROOTFS_PATH}" "${ROOTFS_URL}"
    chmod 644 "${ROOTFS_PATH}"
    echo "✓ Rootfs downloaded to ${ROOTFS_PATH}"
}

# Function to create a custom rootfs with Node.js
create_nodejs_rootfs() {
    local BASE_ROOTFS="${IMAGES_DIR}/rootfs.ext4"
    local NODEJS_ROOTFS="${IMAGES_DIR}/nodejs-rootfs.ext4"
    
    if [ -f "$NODEJS_ROOTFS" ]; then
        echo "Node.js rootfs already exists at ${NODEJS_ROOTFS}"
        return 0
    fi

    if [ ! -f "$BASE_ROOTFS" ]; then
        echo "Base rootfs not found. Please run download_rootfs first."
        return 1
    fi

    echo "Creating Node.js rootfs..."
    
    # Copy base rootfs
    cp "${BASE_ROOTFS}" "${NODEJS_ROOTFS}"
    
    # Resize to make room for Node.js
    e2fsck -f -y "${NODEJS_ROOTFS}" || true
    resize2fs "${NODEJS_ROOTFS}" 1G
    
    # Mount and customize
    MOUNT_DIR=$(mktemp -d)
    mount -o loop "${NODEJS_ROOTFS}" "${MOUNT_DIR}"
    
    # Create runtime directory
    mkdir -p "${MOUNT_DIR}/var/runtime"
    mkdir -p "${MOUNT_DIR}/var/task"
    
    # Copy runtime files
    cp "${PROJECT_DIR}/runtimes/nodejs/runtime.js" "${MOUNT_DIR}/var/runtime/"
    cp "${PROJECT_DIR}/runtimes/nodejs/package.json" "${MOUNT_DIR}/var/runtime/"
    cp "${PROJECT_DIR}/runtimes/nodejs/bootstrap.sh" "${MOUNT_DIR}/var/runtime/"
    chmod +x "${MOUNT_DIR}/var/runtime/bootstrap.sh"
    
    # Create init script to start runtime
    cat > "${MOUNT_DIR}/etc/init.d/impuls-runtime" << 'EOF'
#!/bin/sh
### BEGIN INIT INFO
# Provides:          impuls-runtime
# Required-Start:    $network
# Required-Stop:
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
# Short-Description: Impuls function runtime
### END INIT INFO

case "$1" in
    start)
        echo "Starting Impuls runtime..."
        cd /var/runtime
        /var/runtime/bootstrap.sh &
        ;;
    stop)
        echo "Stopping Impuls runtime..."
        pkill -f "node runtime.js"
        ;;
    *)
        echo "Usage: $0 {start|stop}"
        exit 1
        ;;
esac
exit 0
EOF
    chmod +x "${MOUNT_DIR}/etc/init.d/impuls-runtime"
    
    # Cleanup
    umount "${MOUNT_DIR}"
    rmdir "${MOUNT_DIR}"
    
    echo "✓ Node.js rootfs created at ${NODEJS_ROOTFS}"
}

# Function to create minimal Alpine-based rootfs
create_alpine_rootfs() {
    local ALPINE_ROOTFS="${IMAGES_DIR}/alpine-nodejs-rootfs.ext4"
    
    if [ -f "$ALPINE_ROOTFS" ]; then
        echo "Alpine rootfs already exists at ${ALPINE_ROOTFS}"
        return 0
    fi

    echo "Creating Alpine-based rootfs with Node.js..."
    echo "Note: This requires docker to be installed"
    
    if ! command -v docker &> /dev/null; then
        echo "Docker not found. Skipping Alpine rootfs creation."
        echo "You can use the downloaded Ubuntu rootfs instead."
        return 0
    fi
    
    # Create ext4 filesystem
    dd if=/dev/zero of="${ALPINE_ROOTFS}" bs=1M count=512
    mkfs.ext4 "${ALPINE_ROOTFS}"
    
    # Mount and populate
    MOUNT_DIR=$(mktemp -d)
    mount -o loop "${ALPINE_ROOTFS}" "${MOUNT_DIR}"
    
    # Use Docker to create Alpine filesystem
    docker run --rm -v "${MOUNT_DIR}:/rootfs" alpine:latest sh -c '
        apk add --no-cache nodejs npm openrc
        cp -a /bin /etc /home /lib /root /run /sbin /srv /tmp /usr /var /rootfs/
        mkdir -p /rootfs/dev /rootfs/proc /rootfs/sys
        mkdir -p /rootfs/var/runtime /rootfs/var/task
    '
    
    # Copy runtime files
    cp "${PROJECT_DIR}/runtimes/nodejs/runtime.js" "${MOUNT_DIR}/var/runtime/"
    cp "${PROJECT_DIR}/runtimes/nodejs/package.json" "${MOUNT_DIR}/var/runtime/"
    cp "${PROJECT_DIR}/runtimes/nodejs/bootstrap.sh" "${MOUNT_DIR}/var/runtime/"
    chmod +x "${MOUNT_DIR}/var/runtime/bootstrap.sh"
    
    # Create init script
    mkdir -p "${MOUNT_DIR}/etc/init.d"
    cat > "${MOUNT_DIR}/etc/init.d/impuls-runtime" << 'EOF'
#!/sbin/openrc-run

name="impuls-runtime"
description="Impuls function runtime"
command="/var/runtime/bootstrap.sh"
command_background="yes"
pidfile="/run/${name}.pid"

depend() {
    need net
}
EOF
    chmod +x "${MOUNT_DIR}/etc/init.d/impuls-runtime"
    
    # Cleanup
    umount "${MOUNT_DIR}"
    rmdir "${MOUNT_DIR}"
    
    echo "✓ Alpine rootfs created at ${ALPINE_ROOTFS}"
}

# Function to link images to data directory
link_images() {
    echo "Linking images to ${DATA_DIR}/images..."
    
    mkdir -p "${DATA_DIR}/images"
    
    if [ -f "${IMAGES_DIR}/vmlinux" ]; then
        ln -sf "${IMAGES_DIR}/vmlinux" "${DATA_DIR}/images/vmlinux"
    fi
    
    if [ -f "${IMAGES_DIR}/nodejs-rootfs.ext4" ]; then
        ln -sf "${IMAGES_DIR}/nodejs-rootfs.ext4" "${DATA_DIR}/images/rootfs.ext4"
    elif [ -f "${IMAGES_DIR}/rootfs.ext4" ]; then
        ln -sf "${IMAGES_DIR}/rootfs.ext4" "${DATA_DIR}/images/rootfs.ext4"
    fi
    
    echo "✓ Images linked"
}

# Main
echo "1. Downloading kernel..."
download_kernel

echo ""
echo "2. Downloading base rootfs..."
download_rootfs

echo ""
echo "3. Creating Node.js rootfs (requires root)..."
if [ "$EUID" -eq 0 ]; then
    create_nodejs_rootfs
else
    echo "⚠ Skipping custom rootfs creation (requires root)"
    echo "  Run with sudo to create optimized rootfs: sudo ./setup-images.sh"
fi

echo ""
echo "4. Linking images..."
if [ "$EUID" -eq 0 ]; then
    link_images
else
    echo "⚠ Skipping image linking (requires root)"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Images available in: ${IMAGES_DIR}"
ls -la "${IMAGES_DIR}/"
echo ""
echo "Next: Build and run the Impuls server"
echo "  cd cmd/impuls-server && go build && sudo ./impuls-server"
