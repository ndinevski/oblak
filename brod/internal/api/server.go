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

	"github.com/oblak/brod/internal/engine"
	"github.com/oblak/brod/internal/models"
	"github.com/oblak/brod/internal/telemetry"
)

// Server is the Brod API server.
type Server struct {
	router   *mux.Router
	engine   engine.ContainerEngine
	registry engine.ImageRegistry
	port     string
}

// Config holds server configuration.
type Config struct {
	Port string

	// DockerHost is the container engine endpoint, e.g.
	// unix:///var/run/docker.sock. Empty uses the environment.
	DockerHost string

	// RegistryURL is where Brod reaches the registry API.
	RegistryURL string
	// RegistryPublicHost is what users put in an image reference. It differs
	// from RegistryURL whenever Brod reaches the registry over a container
	// network but clients reach it from the host.
	RegistryPublicHost string
	RegistryUsername   string
	RegistryPassword   string
}

// GetConfigFromEnv reads configuration from the environment, applying the
// same defaults the compose file sets.
func GetConfigFromEnv() Config {
	return Config{
		Port:               envOr("BROD_PORT", "8083"),
		DockerHost:         os.Getenv("DOCKER_HOST"),
		RegistryURL:        envOr("REGISTRY_URL", "http://brod-registry:5000"),
		RegistryPublicHost: envOr("REGISTRY_PUBLIC_HOST", "localhost:5000"),
		RegistryUsername:   os.Getenv("REGISTRY_USERNAME"),
		RegistryPassword:   os.Getenv("REGISTRY_PASSWORD"),
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// NewServer creates a server backed by a real Docker daemon and registry.
func NewServer(cfg Config) (*Server, error) {
	docker, err := engine.NewDockerClient(engine.DockerConfig{
		Host:         cfg.DockerHost,
		RegistryHost: cfg.RegistryPublicHost,
	})
	if err != nil {
		return nil, err
	}

	registry := engine.NewRegistryClient(engine.RegistryConfig{
		URL:        cfg.RegistryURL,
		PublicHost: cfg.RegistryPublicHost,
		Username:   cfg.RegistryUsername,
		Password:   cfg.RegistryPassword,
	})

	return NewServerWithBackends(cfg, docker, registry), nil
}

// NewServerWithBackends builds a server around supplied backends.
//
// Exported so tests can inject the in-memory mocks instead of requiring a
// Docker daemon, the same way Izvor's server takes a ProxmoxClient.
func NewServerWithBackends(cfg Config, eng engine.ContainerEngine, reg engine.ImageRegistry) *Server {
	s := &Server{
		router:   mux.NewRouter(),
		engine:   eng,
		registry: reg,
		port:     cfg.Port,
	}
	s.setupRoutes()
	return s
}

// setupRoutes configures all API routes.
func (s *Server) setupRoutes() {
	s.router.HandleFunc("/health", s.healthCheck).Methods("GET")

	api := s.router.PathPrefix("/api/v1").Subrouter()

	// Registry info, so a client can discover where to push without being told.
	api.HandleFunc("/registry", s.getRegistryInfo).Methods("GET")

	// Repositories. The literal /images sub-path is registered before the
	// repository wildcard so it is not swallowed by it.
	api.HandleFunc("/repositories", s.listRepositories).Methods("GET")
	api.HandleFunc("/repositories", s.createRepository).Methods("POST")
	api.HandleFunc("/repositories/{name:.+}/images/{tag}", s.getImage).Methods("GET")
	api.HandleFunc("/repositories/{name:.+}/images/{tag}", s.deleteImage).Methods("DELETE")
	api.HandleFunc("/repositories/{name:.+}/images", s.listImages).Methods("GET")
	api.HandleFunc("/repositories/{name:.+}", s.getRepository).Methods("GET")
	api.HandleFunc("/repositories/{name:.+}", s.deleteRepository).Methods("DELETE")

	// Containers.
	api.HandleFunc("/containers", s.listContainers).Methods("GET")
	api.HandleFunc("/containers", s.createContainer).Methods("POST")
	api.HandleFunc("/containers/{id}", s.getContainer).Methods("GET")
	api.HandleFunc("/containers/{id}", s.deleteContainer).Methods("DELETE")
	api.HandleFunc("/containers/{id}/start", s.startContainer).Methods("POST")
	api.HandleFunc("/containers/{id}/stop", s.stopContainer).Methods("POST")
	api.HandleFunc("/containers/{id}/restart", s.restartContainer).Methods("POST")
	api.HandleFunc("/containers/{id}/logs", s.containerLogs).Methods("GET")
	api.HandleFunc("/containers/{id}/stats", s.containerStats).Methods("GET")

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

// Close releases backend connections.
func (s *Server) Close() error {
	if s.engine != nil {
		return s.engine.Close()
	}
	return nil
}

// =============================================================================
// Health
// =============================================================================

// healthCheck reports the service and both backends.
//
// Brod is degraded rather than down when only one backend is unreachable: with
// the registry down existing containers still run, and with the engine down
// images are still browsable. The response says which, and the status code is
// 503 either way so a monitor notices.
func (s *Server) healthCheck(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	body := map[string]interface{}{
		"service": "brod",
		"status":  "healthy",
	}

	engineErr := s.engine.HealthCheck(ctx)
	if engineErr != nil {
		body["engine"] = "unavailable"
		body["engine_error"] = engineErr.Error()
	} else {
		body["engine"] = "connected"
		if v, err := s.engine.Version(ctx); err == nil {
			body["engine_version"] = v
		}
	}

	registryErr := s.registry.HealthCheck(ctx)
	if registryErr != nil {
		body["registry"] = "unavailable"
		body["registry_error"] = registryErr.Error()
	} else {
		body["registry"] = "connected"
		body["registry_host"] = s.registry.Host()
	}

	status := http.StatusOK
	if engineErr != nil || registryErr != nil {
		body["status"] = "degraded"
		status = http.StatusServiceUnavailable
	}

	respondJSON(w, status, body)
}

// getRegistryInfo tells clients where to push and pull.
func (s *Server) getRegistryInfo(w http.ResponseWriter, r *http.Request) {
	host := s.registry.Host()
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"host":         host,
		"push_example": "docker push " + host + "/my-app:v1",
		"pull_example": "docker pull " + host + "/my-app:v1",
		"reachable":    s.registry.HealthCheck(r.Context()) == nil,
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
	case errors.Is(err, models.ErrNotSupported):
		// The request was well formed; the backing service refuses it.
		respondError(w, http.StatusNotImplemented, err.Error())
	case errors.Is(err, models.ErrEngineUnavailable):
		respondError(w, http.StatusServiceUnavailable, err.Error())
	default:
		respondError(w, http.StatusInternalServerError, err.Error())
	}
}

// queryBool reads a boolean query parameter.
func queryBool(r *http.Request, key string) bool {
	v := r.URL.Query().Get(key)
	return v == "true" || v == "1"
}

// queryInt reads an integer query parameter, falling back on absence or junk.
func queryInt(r *http.Request, key string, fallback int) int {
	v := r.URL.Query().Get(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

// LogBackendStatus probes both backends once and records the outcome.
//
// Called at startup so an unreachable engine or registry is visible in the
// logs immediately, rather than only when the first request fails.
func (s *Server) LogBackendStatus(ctx context.Context, logger *slog.Logger) {
	if err := s.engine.HealthCheck(ctx); err != nil {
		logger.Warn("container engine unreachable at startup", "error", err)
	} else if v, verr := s.engine.Version(ctx); verr == nil {
		logger.Info("container engine connected", "version", v)
	}

	if err := s.registry.HealthCheck(ctx); err != nil {
		logger.Warn("image registry unreachable at startup",
			"registry", s.registry.Host(), "error", err)
	} else {
		logger.Info("image registry connected", "registry", s.registry.Host())
	}
}
