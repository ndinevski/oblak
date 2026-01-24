package api

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gorilla/mux"
	"github.com/oblak/izvor/internal/proxmox"
	"github.com/rs/cors"
)

// Server represents the API server
type Server struct {
	router  *mux.Router
	proxmox proxmox.ProxmoxClient
	config  Config
}

// Config holds server configuration
type Config struct {
	Port               string
	ProxmoxURL         string
	ProxmoxUser        string
	ProxmoxPassword    string
	ProxmoxTokenID     string
	ProxmoxTokenSecret string
	ProxmoxNode        string
	InsecureSkipVerify bool
}

// GetConfigFromEnv returns configuration from environment variables
func GetConfigFromEnv() Config {
	return Config{
		Port:               getEnv("IZVOR_PORT", "8082"),
		ProxmoxURL:         getEnv("PROXMOX_URL", ""),
		ProxmoxUser:        getEnv("PROXMOX_USER", "root@pam"),
		ProxmoxPassword:    getEnv("PROXMOX_PASSWORD", ""),
		ProxmoxTokenID:     getEnv("PROXMOX_TOKEN_ID", ""),
		ProxmoxTokenSecret: getEnv("PROXMOX_TOKEN_SECRET", ""),
		ProxmoxNode:        getEnv("PROXMOX_NODE", ""),
		InsecureSkipVerify: getEnv("PROXMOX_INSECURE", "false") == "true",
	}
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

// NewServer creates a new API server
func NewServer(cfg Config, proxmoxClient proxmox.ProxmoxClient) (*Server, error) {
	s := &Server{
		router:  mux.NewRouter(),
		proxmox: proxmoxClient,
		config:  cfg,
	}

	s.setupRoutes()
	return s, nil
}

// Router returns the HTTP router
func (s *Server) Router() http.Handler {
	// Setup CORS
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
	})

	return c.Handler(s.router)
}

// setupRoutes configures all API routes
func (s *Server) setupRoutes() {
	// Health check
	s.router.HandleFunc("/health", s.healthCheck).Methods("GET")

	// API v1
	api := s.router.PathPrefix("/api/v1").Subrouter()

	// VM routes
	api.HandleFunc("/vms", s.listVMs).Methods("GET")
	api.HandleFunc("/vms", s.createVM).Methods("POST")
	api.HandleFunc("/vms/sizes", s.listVMSizes).Methods("GET")
	api.HandleFunc("/vms/{id}", s.getVM).Methods("GET")
	api.HandleFunc("/vms/{id}", s.updateVM).Methods("PUT", "PATCH")
	api.HandleFunc("/vms/{id}", s.deleteVM).Methods("DELETE")
	api.HandleFunc("/vms/{id}/actions", s.vmAction).Methods("POST")
	api.HandleFunc("/vms/{id}/console", s.getVMConsole).Methods("GET")

	// Snapshot routes
	api.HandleFunc("/vms/{id}/snapshots", s.listSnapshots).Methods("GET")
	api.HandleFunc("/vms/{id}/snapshots", s.createSnapshot).Methods("POST")
	api.HandleFunc("/vms/{id}/snapshots/{name}", s.deleteSnapshot).Methods("DELETE")
	api.HandleFunc("/vms/{id}/snapshots/{name}/rollback", s.rollbackSnapshot).Methods("POST")

	// Template routes
	api.HandleFunc("/templates", s.listTemplates).Methods("GET")

	// Node routes
	api.HandleFunc("/nodes", s.listNodes).Methods("GET")
	api.HandleFunc("/nodes/{name}", s.getNode).Methods("GET")
	api.HandleFunc("/nodes/{name}/storage", s.listNodeStorage).Methods("GET")
	api.HandleFunc("/nodes/{name}/networks", s.listNodeNetworks).Methods("GET")

	// Cluster routes
	api.HandleFunc("/cluster/status", s.getClusterStatus).Methods("GET")
	api.HandleFunc("/cluster/resources", s.getClusterResources).Methods("GET")

	// Storage routes
	api.HandleFunc("/storage", s.listStorage).Methods("GET")

	// Task routes
	api.HandleFunc("/tasks/{upid}", s.getTask).Methods("GET")

	// Logging middleware
	s.router.Use(loggingMiddleware)
}

// Run starts the server
func (s *Server) Run() error {
	log.Printf("Izvor API server starting on port %s", s.config.Port)
	return http.ListenAndServe(":"+s.config.Port, s.Router())
}

// loggingMiddleware logs all requests
func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.RequestURI, time.Since(start))
	})
}

// =============================================================================
// Response Helpers
// =============================================================================

func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if data != nil {
		json.NewEncoder(w).Encode(data)
	}
}

func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}

// =============================================================================
// Health Check
// =============================================================================

func (s *Server) healthCheck(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Check Proxmox connection
	version, err := s.proxmox.GetVersion(ctx)
	if err != nil {
		respondJSON(w, http.StatusServiceUnavailable, map[string]interface{}{
			"status":  "unhealthy",
			"service": "izvor",
			"error":   err.Error(),
		})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":          "healthy",
		"service":         "izvor",
		"proxmox_version": version,
	})
}
