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

	"github.com/oblak/izvor/internal/api"
	"github.com/oblak/izvor/internal/proxmox"
)

func main() {
	// Parse command line flags
	port := flag.String("port", "", "Port to listen on (default: 8082)")
	proxmoxURL := flag.String("proxmox-url", "", "Proxmox API URL (e.g., https://pve.example.com:8006)")
	proxmoxUser := flag.String("proxmox-user", "", "Proxmox API user (e.g., root@pam)")
	proxmoxPassword := flag.String("proxmox-password", "", "Proxmox API password")
	proxmoxTokenID := flag.String("proxmox-token-id", "", "Proxmox API token ID (alternative to password)")
	proxmoxTokenSecret := flag.String("proxmox-token-secret", "", "Proxmox API token secret")
	proxmoxNode := flag.String("proxmox-node", "", "Default Proxmox node name")
	insecure := flag.Bool("insecure", false, "Skip TLS certificate verification")
	flag.Parse()

	// Get configuration from environment with flag overrides
	cfg := api.GetConfigFromEnv()

	if *port != "" {
		cfg.Port = *port
	}
	if *proxmoxURL != "" {
		cfg.ProxmoxURL = *proxmoxURL
	}
	if *proxmoxUser != "" {
		cfg.ProxmoxUser = *proxmoxUser
	}
	if *proxmoxPassword != "" {
		cfg.ProxmoxPassword = *proxmoxPassword
	}
	if *proxmoxTokenID != "" {
		cfg.ProxmoxTokenID = *proxmoxTokenID
	}
	if *proxmoxTokenSecret != "" {
		cfg.ProxmoxTokenSecret = *proxmoxTokenSecret
	}
	if *proxmoxNode != "" {
		cfg.ProxmoxNode = *proxmoxNode
	}
	if *insecure {
		cfg.InsecureSkipVerify = true
	}

	// Validate required configuration
	if cfg.ProxmoxURL == "" {
		log.Fatal("Proxmox URL is required. Use --proxmox-url flag or PROXMOX_URL environment variable")
	}

	log.Printf("Izvor VM Service")
	log.Printf("  Port: %s", cfg.Port)
	log.Printf("  Proxmox URL: %s", cfg.ProxmoxURL)
	log.Printf("  Default Node: %s", cfg.ProxmoxNode)

	// Create Proxmox client
	proxmoxClient, err := proxmox.NewClient(proxmox.Config{
		URL:                cfg.ProxmoxURL,
		User:               cfg.ProxmoxUser,
		Password:           cfg.ProxmoxPassword,
		TokenID:            cfg.ProxmoxTokenID,
		TokenSecret:        cfg.ProxmoxTokenSecret,
		DefaultNode:        cfg.ProxmoxNode,
		InsecureSkipVerify: cfg.InsecureSkipVerify,
	})
	if err != nil {
		log.Fatalf("Failed to create Proxmox client: %v", err)
	}

	// Create and run server
	server, err := api.NewServer(cfg, proxmoxClient)
	if err != nil {
		log.Fatalf("Failed to create server: %v", err)
		os.Exit(1)
	}

	// Create HTTP server
	httpServer := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      server.Router(),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 120 * time.Second, // Longer timeout for VM operations
		IdleTimeout:  60 * time.Second,
	}

	// Start server in a goroutine
	go func() {
		log.Printf("Izvor server starting on port %s", cfg.Port)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
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

	if err := httpServer.Shutdown(ctx); err != nil {
		log.Printf("Server forced to shutdown: %v", err)
	}

	log.Println("Server stopped")
}
