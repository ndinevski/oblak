#!/bin/bash
# Build a Firecracker rootfs for an Impuls runtime.
#
# Produces an ext4 image containing a language runtime plus the Impuls guest
# agent, launched by a tiny init (PID 1). Networking is configured by the kernel
# from the ip= boot arg (CONFIG_IP_PNP), so the agent binds :8080 immediately.
#
# Usage: sudo ./build-rootfs.sh [runtime]
#   runtime: nodejs (default). python/dotnet planned.
#
# Output: <project>/images/<runtime>-rootfs.ext4  (and linked into DATA_DIR)
set -euo pipefail

RUNTIME="${1:-nodejs}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
IMAGES_DIR="${PROJECT_DIR}/images"
DATA_DIR="${DATA_DIR:-/var/lib/impuls}"
SIZE_MB="${SIZE_MB:-1024}"

AGENT=""       # single agent file to copy (node/python)
DOTNET=""      # non-empty for the .NET publish path
case "$RUNTIME" in
  nodejs|nodejs20) DOCKER_IMAGE="node:20-slim"; OUT="nodejs20-rootfs.ext4"; AGENT="nodejs/runtime.js"; START="exec node /var/runtime/runtime.js" ;;
  python|python312) DOCKER_IMAGE="python:3.12-slim"; OUT="python312-rootfs.ext4"; AGENT="python/runtime.py"; START="exec python3 /var/runtime/runtime.py" ;;
  dotnet|dotnet8) DOCKER_IMAGE="mcr.microsoft.com/dotnet/aspnet:8.0"; OUT="dotnet8-rootfs.ext4"; DOTNET="1"; START="exec dotnet /var/runtime/ImpulsRuntime.dll"; SIZE_MB="${SIZE_MB:-1536}" ;;
  *) echo "unsupported runtime: $RUNTIME"; exit 1 ;;
esac

if [ "$EUID" -ne 0 ]; then echo "run as root (mount needs it)"; exit 1; fi

mkdir -p "$IMAGES_DIR" "${DATA_DIR}/images"
IMG="${IMAGES_DIR}/${OUT}"
echo "=== Building ${OUT} from ${DOCKER_IMAGE} ==="

# 1. Export the base image's filesystem.
CID=$(docker create "$DOCKER_IMAGE" /bin/true)
TARBALL=$(mktemp /tmp/rootfs-XXXX.tar)
docker export "$CID" > "$TARBALL"
docker rm "$CID" >/dev/null

# 2. Create and format a fresh ext4 image.
rm -f "$IMG"
dd if=/dev/zero of="$IMG" bs=1M count="$SIZE_MB" status=none
mkfs.ext4 -q -F "$IMG"

# 3. Extract the base filesystem into it.
MNT=$(mktemp -d)
mount -o loop "$IMG" "$MNT"
tar -xf "$TARBALL" -C "$MNT"
rm -f "$TARBALL"

# 4. Install the Impuls guest agent and its init launcher.
mkdir -p "$MNT/var/runtime" "$MNT/var/task" "$MNT/proc" "$MNT/sys" "$MNT/dev"
if [ -n "$DOTNET" ]; then
    # The .NET agent must be compiled. Publish it with the SDK image, then copy
    # the published output (agent DLL + Roslyn deps) into the rootfs.
    echo "publishing .NET agent..."
    # Build in a writable temp copy (dotnet writes obj/) mounted with an SELinux
    # relabel (Z), so this works on Fedora/SELinux hosts too.
    PUBSRC=$(mktemp -d); PUBDIR=$(mktemp -d)
    cp -a "${PROJECT_DIR}/runtimes/dotnet/." "$PUBSRC/"
    rm -rf "$PUBSRC/obj" "$PUBSRC/bin"
    docker run --rm \
        -v "${PUBSRC}:/src:Z" \
        -v "${PUBDIR}:/out:Z" \
        mcr.microsoft.com/dotnet/sdk:8.0 \
        dotnet publish /src/ImpulsRuntime.csproj -c Release -o /out >/dev/null
    cp -a "${PUBDIR}/." "$MNT/var/runtime/"
    rm -rf "$PUBSRC" "$PUBDIR"
else
    cp "${PROJECT_DIR}/runtimes/${AGENT}" "$MNT/var/runtime/"
    [ -f "${PROJECT_DIR}/runtimes/nodejs/package.json" ] && cp "${PROJECT_DIR}/runtimes/nodejs/package.json" "$MNT/var/runtime/" || true
fi

cat > "$MNT/sbin/impuls-init" <<EOF
#!/bin/sh
# Impuls guest init (PID 1). The kernel has already configured eth0 from the
# ip= boot arg, so we just mount the pseudo-filesystems and start the agent.
mount -t proc proc /proc 2>/dev/null
mount -t sysfs sysfs /sys 2>/dev/null
mount -t devtmpfs devtmpfs /dev 2>/dev/null
${START}
EOF
chmod +x "$MNT/sbin/impuls-init"

sync
umount "$MNT"
rmdir "$MNT"

# 5. Link the default rootfs for convenience.
ln -sf "$IMG" "${DATA_DIR}/images/${OUT}"

echo "=== Done: ${IMG} ($(du -h "$IMG" | cut -f1)) ==="
