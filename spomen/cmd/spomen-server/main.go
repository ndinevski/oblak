package main

import (
	"context"
	"flag"
	"log"
	"os"
	"time"

	"github.com/n1xx1n/spomen/internal/api"
	"github.com/n1xx1n/spomen/internal/telemetry"
)

// serviceVersion is stamped onto every signal so a regression can be tied to
// a specific build. Override at build time with:
//   -ldflags "-X main.serviceVersion=$(git describe --tags --always)"
var serviceVersion = "dev"

func main() {
	// Command line flags
	port := flag.String("port", "", "API server port (default: 8081)")
	minioEndpoint := flag.String("minio-endpoint", "", "Minio endpoint (default: localhost:9000)")
	minioAccessKey := flag.String("minio-access-key", "", "Minio access key")
	minioSecretKey := flag.String("minio-secret-key", "", "Minio secret key")
	minioSSL := flag.Bool("minio-ssl", false, "Use SSL for Minio connection")
	flag.Parse()

	// Get configuration from environment with flag overrides
	cfg := api.GetConfigFromEnv()

	if *port != "" {
		cfg.Port = *port
	}
	if *minioEndpoint != "" {
		cfg.MinioEndpoint = *minioEndpoint
	}
	if *minioAccessKey != "" {
		cfg.MinioAccessKey = *minioAccessKey
	}
	if *minioSecretKey != "" {
		cfg.MinioSecretKey = *minioSecretKey
	}
	if *minioSSL {
		cfg.MinioUseSSL = true
	}

	// Validate required configuration
	if cfg.MinioAccessKey == "" || cfg.MinioSecretKey == "" {
		log.Println("Warning: Minio credentials not set, using defaults")
	}

	// Telemetry first, so that startup problems are visible in the Oblak
	// dashboard rather than only in stdout.
	telCtx, telCancel := context.WithTimeout(context.Background(), 15*time.Second)
	tel, telErr := telemetry.Init(telCtx, telemetry.ConfigFromEnv("spomen", serviceVersion))
	telCancel()
	if telErr != nil {
		// A telemetry outage must never stop the service from serving traffic.
		log.Printf("telemetry disabled: %v", telErr)
	}
	logger := tel.Logger

	logger.Info("spomen object storage api starting",
		"port", cfg.Port,
		"minio_endpoint", cfg.MinioEndpoint,
		"minio_ssl", cfg.MinioUseSSL,
		"telemetry_enabled", tel.Enabled,
	)

	// Create and run server
	server, err := api.NewServer(cfg)
	if err != nil {
		logger.Error("failed to create server", "error", err)
		flushTelemetry(tel)
		os.Exit(1)
	}

	if err := server.UseTelemetry(tel, "spomen"); err != nil {
		logger.Warn("could not install telemetry middleware", "error", err)
	}

	if err := server.Run(); err != nil {
		logger.Error("server error", "error", err)
		flushTelemetry(tel)
		os.Exit(1)
	}
}

// flushTelemetry drains buffered signals before the process exits, so the
// error that caused the exit is not lost with the batch that held it.
func flushTelemetry(tel *telemetry.Telemetry) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := tel.Shutdown(ctx); err != nil {
		log.Printf("Error flushing telemetry: %v", err)
	}
}
