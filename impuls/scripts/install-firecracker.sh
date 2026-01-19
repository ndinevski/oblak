#!/bin/bash
# Install Firecracker on Linux
# Requires: curl, tar

set -e

FIRECRACKER_VERSION="${FIRECRACKER_VERSION:-v1.6.0}"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
ARCH=$(uname -m)

echo "=== Installing Firecracker ${FIRECRACKER_VERSION} ==="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (sudo ./install-firecracker.sh)"
    exit 1
fi

# Check architecture
if [ "$ARCH" != "x86_64" ] && [ "$ARCH" != "aarch64" ]; then
    echo "Unsupported architecture: $ARCH"
    echo "Firecracker only supports x86_64 and aarch64"
    exit 1
fi

# Map architecture name
if [ "$ARCH" == "x86_64" ]; then
    FC_ARCH="x86_64"
else
    FC_ARCH="aarch64"
fi

# Download URL
RELEASE_URL="https://github.com/firecracker-microvm/firecracker/releases/download"
TAR_FILE="firecracker-${FIRECRACKER_VERSION}-${FC_ARCH}.tgz"
DOWNLOAD_URL="${RELEASE_URL}/${FIRECRACKER_VERSION}/${TAR_FILE}"

# Create temp directory
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

echo "Downloading Firecracker from ${DOWNLOAD_URL}..."
curl -fsSL -o "$TAR_FILE" "$DOWNLOAD_URL"

echo "Extracting..."
tar -xzf "$TAR_FILE"

# Find the extracted directory
EXTRACTED_DIR=$(find . -maxdepth 1 -type d -name "release-*" | head -1)
if [ -z "$EXTRACTED_DIR" ]; then
    EXTRACTED_DIR="."
fi

# Install binaries
echo "Installing to ${INSTALL_DIR}..."

# Install firecracker
cp "${EXTRACTED_DIR}/firecracker-${FIRECRACKER_VERSION}-${FC_ARCH}" "${INSTALL_DIR}/firecracker"
chmod +x "${INSTALL_DIR}/firecracker"

# Install jailer
cp "${EXTRACTED_DIR}/jailer-${FIRECRACKER_VERSION}-${FC_ARCH}" "${INSTALL_DIR}/jailer"
chmod +x "${INSTALL_DIR}/jailer"

# Cleanup
cd /
rm -rf "$TEMP_DIR"

echo ""
echo "=== Installation Complete ==="
echo "Firecracker: ${INSTALL_DIR}/firecracker"
echo "Jailer: ${INSTALL_DIR}/jailer"
echo ""

# Verify installation
echo "Version info:"
"${INSTALL_DIR}/firecracker" --version

# Check KVM
echo ""
echo "=== Checking KVM Support ==="
if [ -e /dev/kvm ]; then
    echo "✓ /dev/kvm exists"
    
    # Check permissions
    if [ -r /dev/kvm ] && [ -w /dev/kvm ]; then
        echo "✓ /dev/kvm is readable and writable"
    else
        echo "⚠ /dev/kvm exists but may not be accessible"
        echo "  You may need to add your user to the 'kvm' group:"
        echo "  sudo usermod -aG kvm \$USER"
    fi
else
    echo "✗ /dev/kvm not found"
    echo "  Make sure KVM is enabled in your kernel and CPU supports virtualization"
    echo "  On cloud instances, you may need a metal/bare-metal instance"
fi

echo ""
echo "=== Next Steps ==="
echo "1. Run ./scripts/setup-images.sh to download kernel and rootfs images"
echo "2. Build the Impuls server: cd cmd/impuls-server && go build"
echo "3. Run: sudo ./impuls-server"
