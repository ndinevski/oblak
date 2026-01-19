# Build stage
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build
RUN CGO_ENABLED=0 GOOS=linux go build -o /impuls-server ./cmd/impuls-server

# Runtime stage
FROM mcr.microsoft.com/dotnet/sdk:8.0-alpine AS dotnet-base

FROM alpine:3.19

# Install runtime dependencies
RUN apk add --no-cache \
    ca-certificates \
    nodejs \
    npm \
    python3 \
    py3-pip \
    curl \
    iproute2 \
    iptables \
    e2fsprogs \
    coreutils \
    bash \
    icu-libs \
    libgcc \
    libstdc++

# Copy .NET SDK from dotnet-base
COPY --from=dotnet-base /usr/share/dotnet /usr/share/dotnet
RUN ln -s /usr/share/dotnet/dotnet /usr/bin/dotnet

WORKDIR /app

# Copy binary
COPY --from=builder /impuls-server /app/impuls-server

# Copy runtime files
COPY runtimes/ /app/runtimes/

# Copy scripts
COPY scripts/ /app/scripts/
RUN chmod +x /app/scripts/*.sh

# Create data directories
RUN mkdir -p /var/lib/impuls/functions \
    /var/lib/impuls/images \
    /var/lib/impuls/vms \
    /var/lib/impuls/sockets \
    /var/lib/impuls/logs

# Download Firecracker binary
ARG FIRECRACKER_VERSION=v1.6.0
ARG TARGETARCH=amd64
RUN ARCH=$([ "$TARGETARCH" = "arm64" ] && echo "aarch64" || echo "x86_64") && \
    mkdir -p /usr/local/bin && \
    curl -fsSL -o /tmp/firecracker.tgz \
    "https://github.com/firecracker-microvm/firecracker/releases/download/${FIRECRACKER_VERSION}/firecracker-${FIRECRACKER_VERSION}-${ARCH}.tgz" && \
    tar -xzf /tmp/firecracker.tgz -C /tmp && \
    mv /tmp/release-${FIRECRACKER_VERSION}-${ARCH}/firecracker-${FIRECRACKER_VERSION}-${ARCH} /usr/local/bin/firecracker && \
    mv /tmp/release-${FIRECRACKER_VERSION}-${ARCH}/jailer-${FIRECRACKER_VERSION}-${ARCH} /usr/local/bin/jailer && \
    chmod +x /usr/local/bin/firecracker /usr/local/bin/jailer && \
    rm -rf /tmp/firecracker.tgz /tmp/release-*

# Copy entrypoint script
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["--port", "8080"]
