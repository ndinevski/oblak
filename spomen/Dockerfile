# Build stage
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum* ./
RUN go mod download

# Copy source code
COPY . .

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -o spomen-server ./cmd/spomen-server

# Runtime stage
FROM alpine:3.19

WORKDIR /app

# Install ca-certificates for HTTPS connections
RUN apk --no-cache add ca-certificates

# Copy the binary
COPY --from=builder /app/spomen-server .

# Expose the API port
EXPOSE 8081

# Run the server
ENTRYPOINT ["./spomen-server"]
