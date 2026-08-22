package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/oblak/impuls/internal/api"
	"github.com/oblak/impuls/internal/firecracker"
	"github.com/oblak/impuls/internal/function"
	"github.com/oblak/impuls/internal/storage"
	"github.com/oblak/impuls/internal/telemetry"
)

// serviceVersion is stamped onto every signal so a regression can be tied to
// a specific build. Override at build time with:
//   -ldflags "-X main.serviceVersion=$(git describe --tags --always)"
var serviceVersion = "dev"

func main() {
	// Parse command line flags
	port := flag.String("port", "8080", "Port to listen on")
	dataDir := flag.String("data-dir", "/var/lib/impuls", "Directory for storing function data")
	firecrackerBin := flag.String("firecracker", "/usr/local/bin/firecracker", "Path to firecracker binary")
	kernelPath := flag.String("kernel", "", "Path to kernel image (defaults to data-dir/images/vmlinux)")
	rootfsPath := flag.String("rootfs", "", "Path to rootfs image (defaults to data-dir/images/rootfs.ext4)")
	storageType := flag.String("storage", "file", "Storage type: file or postgres")
	dbConnStr := flag.String("db-conn", "", "Database connection string (required for postgres storage)")
	flag.Parse()

	// Telemetry first, so that everything after this point (including startup
	// failures) is visible in the Oblak dashboard rather than only in stdout.
	telCtx, telCancel := context.WithTimeout(context.Background(), 15*time.Second)
	tel, telErr := telemetry.Init(telCtx, telemetry.ConfigFromEnv("impuls", serviceVersion))
	telCancel()
	if telErr != nil {
		// A telemetry outage must never stop the service from serving traffic.
		log.Printf("telemetry disabled: %v", telErr)
	}
	logger := tel.Logger

	// Set default paths
	if *kernelPath == "" {
		*kernelPath = *dataDir + "/images/vmlinux"
	}
	if *rootfsPath == "" {
		*rootfsPath = *dataDir + "/images/rootfs.ext4"
	}

	// Initialize storage based on type
	var store storage.Storage
	var err error

	switch *storageType {
	case "postgres":
		if *dbConnStr == "" {
			log.Fatal("Database connection string is required for postgres storage. Use --db-conn flag")
		}
		store, err = storage.NewPostgresStorage(*dbConnStr)
		if err != nil {
			log.Fatalf("Failed to initialize postgres storage: %v", err)
		}
		log.Println("Using PostgreSQL storage")
	case "file":
		store, err = storage.NewFileStorage(*dataDir + "/functions")
		if err != nil {
			log.Fatalf("Failed to initialize file storage: %v", err)
		}
		log.Println("Using file storage")
	default:
		log.Fatalf("Invalid storage type: %s. Must be 'file' or 'postgres'", *storageType)
	}

	// Initialize Firecracker manager
	fcConfig := firecracker.Config{
		FirecrackerBin: *firecrackerBin,
		KernelPath:     *kernelPath,
		RootFSPath:     *rootfsPath,
		DataDir:        *dataDir,
	}
	fcManager, err := firecracker.NewManager(fcConfig)
	if err != nil {
		log.Fatalf("Failed to initialize Firecracker manager: %v", err)
	}

	// Initialize function manager
	funcManager := function.NewManager(store, fcManager)

	// Initialize API server
	apiServer := api.NewServer(funcManager)
	if err := apiServer.UseTelemetry(tel, "impuls"); err != nil {
		logger.Warn("could not install telemetry middleware", "error", err)
	}

	// Create HTTP server
	server := &http.Server{
		Addr:         ":" + *port,
		Handler:      apiServer.Router(),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in a goroutine
	go func() {
		logger.Info("impuls server starting",
			"port", *port,
			"data_dir", *dataDir,
			"firecracker_bin", *firecrackerBin,
			"storage_type", *storageType,
			"telemetry_enabled", tel.Enabled,
		)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Cleanup running VMs
	if err := fcManager.Cleanup(); err != nil {
		log.Printf("Error during Firecracker cleanup: %v", err)
	}

	// Close storage connection if it's PostgreSQL
	if pgStore, ok := store.(*storage.PostgresStorage); ok {
		if err := pgStore.Close(); err != nil {
			log.Printf("Error closing database connection: %v", err)
		}
	}

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("Server forced to shutdown: %v", err)
	}

	// Flush buffered telemetry last, so the shutdown itself is recorded.
	logger.Info("impuls server stopped")
	if err := tel.Shutdown(ctx); err != nil {
		log.Printf("Error flushing telemetry: %v", err)
	}
}
