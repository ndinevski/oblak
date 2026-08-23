package api

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"strconv"

	"github.com/gorilla/mux"
	"github.com/rs/cors"

	"github.com/oblak/tefter/internal/engine"
	"github.com/oblak/tefter/internal/models"
	"github.com/oblak/tefter/internal/telemetry"
)

// Server is the Tefter API server.
type Server struct {
	router      *mux.Router
	provisioner engine.Provisioner
	port        string
}

// Config holds server configuration.
type Config struct {
	Port string

	DockerHost string
	// Network the instance containers join, so a replica can reach its
	// primary by container name.
	Network string

	PortRangeStart int
	PortRangeEnd   int

	BackupDir string
	// PublicHost is the address clients use to reach a provisioned database.
	PublicHost string
}

// GetConfigFromEnv reads configuration from the environment.
func GetConfigFromEnv() Config {
	return Config{
		Port:           envOr("TEFTER_PORT", "8084"),
		DockerHost:     os.Getenv("DOCKER_HOST"),
		Network:        envOr("TEFTER_NETWORK", "tefter-network"),
		PortRangeStart: envInt("TEFTER_PORT_RANGE_START", 15000),
		PortRangeEnd:   envInt("TEFTER_PORT_RANGE_END", 15999),
		BackupDir:      envOr("TEFTER_BACKUP_DIR", "/var/lib/tefter/backups"),
		PublicHost:     envOr("TEFTER_PUBLIC_HOST", "localhost"),
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

// NewServer creates a server backed by a real container runtime.
func NewServer(cfg Config) (*Server, error) {
	provisioner, err := engine.NewDockerProvisioner(engine.DockerConfig{
		Host:           cfg.DockerHost,
		Network:        cfg.Network,
		PortRangeStart: cfg.PortRangeStart,
		PortRangeEnd:   cfg.PortRangeEnd,
		BackupDir:      cfg.BackupDir,
		PublicHost:     cfg.PublicHost,
	})
	if err != nil {
		return nil, err
	}
	return NewServerWithProvisioner(cfg, provisioner), nil
}

// NewServerWithProvisioner builds a server around a supplied backend.
//
// Exported so tests can inject the in-memory mock instead of requiring a
// container runtime and real databases.
func NewServerWithProvisioner(cfg Config, p engine.Provisioner) *Server {
	s := &Server{
		router:      mux.NewRouter(),
		provisioner: p,
		port:        cfg.Port,
	}
	s.setupRoutes()
	return s
}

// setupRoutes configures all API routes.
func (s *Server) setupRoutes() {
	s.router.HandleFunc("/health", s.healthCheck).Methods("GET")

	api := s.router.PathPrefix("/api/v1").Subrouter()

	// Catalogue, so a client can discover what it may provision.
	api.HandleFunc("/engines", s.listEngines).Methods("GET")
	api.HandleFunc("/sizes", s.listSizes).Methods("GET")

	// Backups. Registered before the instance wildcard so /backups is not
	// captured by /instances/{name}.
	api.HandleFunc("/backups", s.listBackups).Methods("GET")
	api.HandleFunc("/backups/restore", s.restoreBackup).Methods("POST")
	api.HandleFunc("/backups/{id}", s.getBackup).Methods("GET")
	api.HandleFunc("/backups/{id}", s.deleteBackup).Methods("DELETE")

	// Instances.
	api.HandleFunc("/instances", s.listInstances).Methods("GET")
	api.HandleFunc("/instances", s.createInstance).Methods("POST")
	api.HandleFunc("/instances/{name}", s.getInstance).Methods("GET")
	api.HandleFunc("/instances/{name}", s.deleteInstance).Methods("DELETE")
	api.HandleFunc("/instances/{name}/start", s.startInstance).Methods("POST")
	api.HandleFunc("/instances/{name}/stop", s.stopInstance).Methods("POST")

	// Backups of one instance.
	api.HandleFunc("/instances/{name}/backups", s.listInstanceBackups).Methods("GET")
	api.HandleFunc("/instances/{name}/backups", s.createBackup).Methods("POST")

	// Replication.
	api.HandleFunc("/instances/{name}/replicas", s.listReplicas).Methods("GET")
	api.HandleFunc("/instances/{name}/replicas", s.createReplica).Methods("POST")
	api.HandleFunc("/instances/{name}/replication", s.replicationStatus).Methods("GET")
	api.HandleFunc("/instances/{name}/promote", s.promoteReplica).Methods("POST")

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

// Router returns the HTTP handler, with CORS applied.
func (s *Server) Router() http.Handler {
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
	})
	return c.Handler(s.router)
}

// Port returns the configured listen port.
func (s *Server) Port() string { return s.port }

// Provisioner exposes the underlying provisioner, so the observability
// collector can read instance stats through the same layer the API uses.
func (s *Server) Provisioner() engine.Provisioner { return s.provisioner }

// Close releases backend connections.
func (s *Server) Close() error {
	if s.provisioner != nil {
		return s.provisioner.Close()
	}
	return nil
}

// LogBackendStatus probes the runtime once and records the outcome, so an
// unreachable engine is visible at startup rather than on the first request.
func (s *Server) LogBackendStatus(ctx context.Context, logger *slog.Logger) {
	if err := s.provisioner.HealthCheck(ctx); err != nil {
		logger.Warn("container runtime unreachable at startup", "error", err)
		return
	}
	if v, err := s.provisioner.Version(ctx); err == nil {
		logger.Info("container runtime connected", "version", v)
	}
}

// =============================================================================
// Health and catalogue
// =============================================================================

func (s *Server) healthCheck(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	body := map[string]interface{}{
		"service": "tefter",
		"status":  "healthy",
	}

	if err := s.provisioner.HealthCheck(ctx); err != nil {
		body["status"] = "degraded"
		body["runtime"] = "unavailable"
		body["runtime_error"] = err.Error()
		respondJSON(w, http.StatusServiceUnavailable, body)
		return
	}

	body["runtime"] = "connected"
	if v, err := s.provisioner.Version(ctx); err == nil {
		body["runtime_version"] = v
	}
	if instances, err := s.provisioner.ListInstances(ctx); err == nil {
		body["instances"] = len(instances)
	}

	respondJSON(w, http.StatusOK, body)
}

// listEngines returns the engines and versions Tefter can provision.
func (s *Server) listEngines(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"engines": models.SupportedVersions,
	})
}

// listSizes returns the predefined instance sizes.
func (s *Server) listSizes(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"sizes": models.PredefinedSizes,
	})
}

// =============================================================================
// Response helpers
// =============================================================================

func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if data != nil {
		_ = json.NewEncoder(w).Encode(data)
	}
}

func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}

// respondBackendError maps a backend error onto an HTTP status.
//
// Centralised so every handler reports the same condition the same way, and so
// a "not found" never surfaces as a 500.
func respondBackendError(w http.ResponseWriter, err error) {
	switch {
	case models.IsValidationError(err):
		respondError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, models.ErrNotFound):
		respondError(w, http.StatusNotFound, err.Error())
	case errors.Is(err, models.ErrAlreadyExists):
		respondError(w, http.StatusConflict, err.Error())
	case errors.Is(err, models.ErrHasReplicas):
		// The request is well formed but the instance is not in a state that
		// allows it, which is a conflict rather than a bad request.
		respondError(w, http.StatusConflict, err.Error())
	case errors.Is(err, models.ErrInstanceNotReady):
		respondError(w, http.StatusConflict, err.Error())
	case errors.Is(err, models.ErrNotSupported):
		respondError(w, http.StatusNotImplemented, err.Error())
	case errors.Is(err, models.ErrEngineUnavailable):
		respondError(w, http.StatusServiceUnavailable, err.Error())
	default:
		respondError(w, http.StatusInternalServerError, err.Error())
	}
}
