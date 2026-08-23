#!/bin/bash
# Set up the Firecracker kernel and rootfs images Impuls needs to run functions
# in microVMs. Idempotent: existing images are left in place.
#
# Produces:
#   <project>/images/vmlinux              - guest kernel (CONFIG_IP_PNP for boot-arg networking)
#   <project>/images/nodejs20-rootfs.ext4 - Node.js runtime + Impuls agent
# and links them into DATA_DIR (default /var/lib/impuls/images), where the
# server looks by default.
#
# Run as root (building a rootfs needs loop-mount). Requires: curl, docker,
# mkfs.ext4.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
IMAGES_DIR="${PROJECT_DIR}/images"
DATA_DIR="${DATA_DIR:-/var/lib/impuls}"

# A Firecracker CI kernel: 5.10, built with CONFIG_IP_PNP / virtio / ext4, which
# is what the manager's ip= boot arg and virtio rootfs/net rely on.
KERNEL_URL="${KERNEL_URL:-https://s3.amazonaws.com/spec.ccfc.min/firecracker-ci/v1.10/x86_64/vmlinux-5.10.223}"

if [ "$EUID" -ne 0 ]; then
    echo "Run as root: sudo ./setup-images.sh"
    exit 1
fi

mkdir -p "$IMAGES_DIR" "${DATA_DIR}/images"

echo "=== 1. Kernel ==="
if [ -f "${IMAGES_DIR}/vmlinux" ]; then
    echo "kernel already present: ${IMAGES_DIR}/vmlinux"
else
    echo "downloading kernel..."
    curl -fsSL -o "${IMAGES_DIR}/vmlinux" "$KERNEL_URL"
    echo "kernel -> ${IMAGES_DIR}/vmlinux"
fi
ln -sf "${IMAGES_DIR}/vmlinux" "${DATA_DIR}/images/vmlinux"

# Which runtime rootfs images to build. Override to a subset, e.g.
# RUNTIMES="nodejs" ./setup-images.sh
RUNTIMES="${RUNTIMES:-nodejs python dotnet}"

declare -A OUTFILE=( [nodejs]=nodejs20-rootfs.ext4 [python]=python312-rootfs.ext4 [dotnet]=dotnet8-rootfs.ext4 )

step=2
for rt in $RUNTIMES; do
    out="${OUTFILE[$rt]}"
    echo ""
    echo "=== ${step}. ${rt} rootfs (${out}) ==="
    if [ -f "${IMAGES_DIR}/${out}" ]; then
        echo "rootfs already present: ${IMAGES_DIR}/${out}"
    else
        "${SCRIPT_DIR}/build-rootfs.sh" "$rt"
    fi
    ln -sf "${IMAGES_DIR}/${out}" "${DATA_DIR}/images/${out}"
    step=$((step+1))
done

# The server's default rootfs path (fallback); per-runtime images override it at
# invoke time. Point it at the Node.js image.
if [ -f "${IMAGES_DIR}/nodejs20-rootfs.ext4" ]; then
    ln -sf "${IMAGES_DIR}/nodejs20-rootfs.ext4" "${DATA_DIR}/images/rootfs.ext4"
fi

echo ""
echo "=== Done ==="
ls -lah "${DATA_DIR}/images/"
echo ""
echo "Next:"
echo "  1. Verify KVM:            ls -l /dev/kvm"
echo "  2. Install firecracker:   sudo ./scripts/install-firecracker.sh"
echo "  3. Run the server (root): sudo impuls-server --storage postgres --db-conn ..."
echo "  Builds nodejs, python, dotnet by default. Subset: RUNTIMES=nodejs ./setup-images.sh"
