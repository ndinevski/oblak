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
)

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
		log.Printf("Impuls server starting on port %s", *port)
		log.Printf("Data directory: %s", *dataDir)
		log.Printf("Firecracker binary: %s", *firecrackerBin)
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
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server stopped")
}
