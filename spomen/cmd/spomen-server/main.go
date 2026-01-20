package main

import (
	"flag"
	"log"
	"os"

	"github.com/n1xx1n/spomen/internal/api"
)

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

	log.Printf("Spomen Object Storage API")
	log.Printf("  Port: %s", cfg.Port)
	log.Printf("  Minio Endpoint: %s", cfg.MinioEndpoint)
	log.Printf("  Minio SSL: %v", cfg.MinioUseSSL)

	// Create and run server
	server, err := api.NewServer(cfg)
	if err != nil {
		log.Fatalf("Failed to create server: %v", err)
		os.Exit(1)
	}

	if err := server.Run(); err != nil {
		log.Fatalf("Server error: %v", err)
		os.Exit(1)
	}
}
