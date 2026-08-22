package api

import (
	"encoding/json"
	"log"
	"net/http"
	"os"

	"github.com/gorilla/mux"
	"github.com/n1xx1n/spomen/internal/storage"
	"github.com/n1xx1n/spomen/internal/telemetry"
	"github.com/rs/cors"
)

// Server represents the API server
type Server struct {
	router  *mux.Router
	storage *storage.Client
	port    string
}

// Config holds server configuration
type Config struct {
	Port                string
	MinioEndpoint       string
	MinioPublicEndpoint string
	MinioRegion         string
	MinioAccessKey      string
	MinioSecretKey      string
	MinioUseSSL         bool
}

// NewServer creates a new API server
func NewServer(cfg Config) (*Server, error) {
	// Create storage client
	storageClient, err := storage.NewClient(storage.Config{
		Endpoint:       cfg.MinioEndpoint,
		PublicEndpoint: cfg.MinioPublicEndpoint,
		Region:         cfg.MinioRegion,
		AccessKey:      cfg.MinioAccessKey,
		SecretKey:      cfg.MinioSecretKey,
		UseSSL:         cfg.MinioUseSSL,
	})
	if err != nil {
		return nil, err
	}

	s := &Server{
		router:  mux.NewRouter(),
		storage: storageClient,
		port:    cfg.Port,
	}

	s.setupRoutes()
	return s, nil
}

// setupRoutes configures all API routes
func (s *Server) setupRoutes() {
	// Health check
	s.router.HandleFunc("/health", s.healthCheck).Methods("GET")

	// API v1
	api := s.router.PathPrefix("/api/v1").Subrouter()

	// Bucket routes
	api.HandleFunc("/buckets", s.listBuckets).Methods("GET")
	api.HandleFunc("/buckets", s.createBucket).Methods("POST")
	api.HandleFunc("/buckets/{bucket}", s.getBucket).Methods("GET")
	api.HandleFunc("/buckets/{bucket}", s.updateBucket).Methods("PUT", "PATCH")
	api.HandleFunc("/buckets/{bucket}", s.deleteBucket).Methods("DELETE")

	// Bulk operations
	api.HandleFunc("/buckets/{bucket}/delete", s.deleteObjects).Methods("POST")

	// Presigned URLs
	api.HandleFunc("/buckets/{bucket}/presign", s.getPresignedURL).Methods("POST")
	api.HandleFunc("/access/credentials", s.issueCredentials).Methods("POST")

	// Object routes - list first (no key param)
	api.HandleFunc("/buckets/{bucket}/objects", s.listObjects).Methods("GET")

	// Object info/copy - use query param approach instead of path suffix
	// GET /buckets/{bucket}/objects/{key}?info=true for metadata
	// POST /buckets/{bucket}/objects/{key}?action=copy for copy
	api.HandleFunc("/buckets/{bucket}/objects/{key:.*}", s.handleObject).Methods("GET", "PUT", "DELETE", "POST")

	// Access logging is handled by the telemetry middleware (see
	// UseTelemetry), which emits a trace-correlated record per request.
}

// UseTelemetry installs tracing, RED metrics and access logging on every
// route. Called after NewServer so the service can still run untraced, which
// is what the unit tests do.
func (s *Server) UseTelemetry(tel *telemetry.Telemetry, serviceName string) error {
	metrics, err := telemetry.NewHTTPMetrics(serviceName)
	if err != nil {
		return err
	}
	s.router.Use(tel.Middleware(serviceName, metrics))
	return nil
}

// Run starts the server
func (s *Server) Run() error {
	// Setup CORS
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
	})

	handler := c.Handler(s.router)

	log.Printf("Spomen API server starting on port %s", s.port)
	return http.ListenAndServe(":"+s.port, handler)
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

	// Check Minio connection
	err := s.storage.HealthCheck(ctx)
	if err != nil {
		respondJSON(w, http.StatusServiceUnavailable, map[string]interface{}{
			"status":  "unhealthy",
			"service": "spomen",
			"error":   err.Error(),
		})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "healthy",
		"service": "spomen",
		"storage": "connected",
	})
}

// GetConfigFromEnv reads configuration from environment variables
func GetConfigFromEnv() Config {
	port := os.Getenv("SPOMEN_PORT")
	if port == "" {
		port = "8081"
	}

	endpoint := os.Getenv("MINIO_ENDPOINT")
	if endpoint == "" {
		endpoint = "localhost:9000"
	}

	accessKey := os.Getenv("MINIO_ROOT_USER")
	if accessKey == "" {
		accessKey = "spomen-admin"
	}

	secretKey := os.Getenv("MINIO_ROOT_PASSWORD")
	if secretKey == "" {
		secretKey = "spomen-secret-key"
	}

	return Config{
		Port:                port,
		MinioEndpoint:       endpoint,
		MinioPublicEndpoint: envOrDefault("MINIO_PUBLIC_ENDPOINT", endpoint),
		MinioRegion:         envOrDefault("MINIO_REGION", "us-east-1"),
		MinioAccessKey:      accessKey,
		MinioSecretKey:      secretKey,
		MinioUseSSL:         os.Getenv("MINIO_USE_SSL") == "true",
	}
}

func envOrDefault(name, fallback string) string {
	value := os.Getenv(name)
	if value == "" {
		return fallback
	}
	return value
}
