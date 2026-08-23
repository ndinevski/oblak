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
	"github.com/oblak/izvor/internal/telemetry"
	"github.com/oblak/izvor/internal/proxmox"
)

// serviceVersion is stamped onto every signal so a regression can be tied to
// a specific build. Override at build time with:
//   -ldflags "-X main.serviceVersion=$(git describe --tags --always)"
var serviceVersion = "dev"

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

	// Allow enabling the simulator from the command line too.
	if os.Getenv("IZVOR_SIMULATE") == "true" {
		cfg.Simulate = true
	}

	// Validate required configuration. In simulator mode there is no Proxmox to
	// point at, so the URL is not required.
	if cfg.ProxmoxURL == "" && !cfg.Simulate {
		log.Fatal("Proxmox URL is required. Use --proxmox-url flag or PROXMOX_URL environment variable (or set IZVOR_SIMULATE=true for the built-in simulator)")
	}

	// Telemetry first, so that startup problems (including an unreachable
	// Proxmox) are visible in the Oblak dashboard rather than only in stdout.
	telCtx, telCancel := context.WithTimeout(context.Background(), 15*time.Second)
	tel, telErr := telemetry.Init(telCtx, telemetry.ConfigFromEnv("izvor", serviceVersion))
	telCancel()
	if telErr != nil {
		// A telemetry outage must never stop the service from serving traffic.
		log.Printf("telemetry disabled: %v", telErr)
	}
	logger := tel.Logger

	logger.Info("izvor vm service starting",
		"port", cfg.Port,
		"proxmox_url", cfg.ProxmoxURL,
		"default_node", cfg.ProxmoxNode,
		"telemetry_enabled", tel.Enabled,
	)

	// Create the Proxmox client: either a real cluster client or the built-in
	// in-memory simulator.
	var proxmoxClient proxmox.ProxmoxClient
	if cfg.Simulate {
		logger.Warn("IZVOR SIMULATOR MODE: VMs are simulated in memory, not provisioned on a real Proxmox cluster")
		proxmoxClient = proxmox.NewSimulator()
	} else {
		client, err := proxmox.NewClient(proxmox.Config{
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
		proxmoxClient = client
	}

	// Create and run server
	server, err := api.NewServer(cfg, proxmoxClient)
	if err != nil {
		log.Fatalf("Failed to create server: %v", err)
		os.Exit(1)
	}

	if err := server.UseTelemetry(tel, "izvor"); err != nil {
		logger.Warn("could not install telemetry middleware", "error", err)
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
		logger.Info("izvor server listening", "port", cfg.Port)
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

	// Flush buffered telemetry last, so the shutdown itself is recorded.
	logger.Info("izvor server stopped")
	if err := tel.Shutdown(ctx); err != nil {
		log.Printf("Error flushing telemetry: %v", err)
	}

	log.Println("Server stopped")
}
