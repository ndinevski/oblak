# Build stage
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum* ./
RUN go mod download

# Copy source code
COPY . .

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -o brod-server ./cmd/brod-server

# Runtime stage
FROM alpine:3.19

WORKDIR /app

# ca-certificates for HTTPS registries, curl for the healthcheck
RUN apk --no-cache add ca-certificates curl

# Copy the binary
COPY --from=builder /app/brod-server .

# Run as a non-root user. Brod reaches docker.sock through the host's docker
# group (see group_add in docker-compose.yml) rather than by running as root.
RUN adduser -D -u 10001 brod && chown -R brod /app
USER brod

# Expose the API port
EXPOSE 8083

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost:8083/health >/dev/null || exit 1

ENTRYPOINT ["./brod-server"]
