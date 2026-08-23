// Package api is Vrata's control plane: the management API for the route table.
// It is separate from the data plane (the proxy in internal/proxy), and runs on
// its own port, so managing routes and serving traffic never contend and their
// telemetry stays cleanly separated.
package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"time"

	"github.com/gorilla/mux"
	"github.com/rs/cors"

	"github.com/oblak/vrata/internal/models"
	"github.com/oblak/vrata/internal/routes"
	"github.com/oblak/vrata/internal/telemetry"
)

// Server is Vrata's management API.
type Server struct {
	router    *mux.Router
	table     *routes.Table
	port      string
	proxyPort string
}

// Config holds management-API configuration.
type Config struct {
	Port string
	// ProxyPort is reported by /health so a client knows where the data plane
	// is, without it being hard-coded on the other side.
	ProxyPort string
}

// GetConfigFromEnv reads configuration from the environment.
func GetConfigFromEnv() Config {
	return Config{
		Port:      envOr("VRATA_API_PORT", "8085"),
		ProxyPort: envOr("VRATA_PROXY_PORT", "8090"),
	}
}

// NewServer builds the management API over a route table.
func NewServer(cfg Config, table *routes.Table) *Server {
	s := &Server{
		router: mux.NewRouter(),
		table:  table,
		port:   cfg.Port,
	}
	s.proxyPort = cfg.ProxyPort
	s.setupRoutes()
	return s
}

// proxyPort is stored on the server so /health can report it.
func (s *Server) setupRoutes() {
	s.router.HandleFunc("/health", s.healthCheck).Methods("GET")

	api := s.router.PathPrefix("/api/v1").Subrouter()
	api.HandleFunc("/routes", s.listRoutes).Methods("GET")
	api.HandleFunc("/routes", s.createRoute).Methods("POST")
	api.HandleFunc("/routes/{name}", s.getRoute).Methods("GET")
	api.HandleFunc("/routes/{name}", s.deleteRoute).Methods("DELETE")
}

// UseTelemetry installs tracing, RED metrics and access logging on the
// management API. The data-plane proxy is instrumented separately.
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

// =============================================================================
// Handlers
// =============================================================================

func (s *Server) healthCheck(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"service":    "vrata",
		"status":     "healthy",
		"routes":     len(s.table.List()),
		"proxy_port": s.proxyPort,
	})
}

func (s *Server) listRoutes(w http.ResponseWriter, r *http.Request) {
	list := s.table.List()
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"routes": list,
		"count":  len(list),
	})
}

func (s *Server) getRoute(w http.ResponseWriter, r *http.Request) {
	route, err := s.table.Get(mux.Vars(r)["name"])
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"route": route})
}

func (s *Server) createRoute(w http.ResponseWriter, r *http.Request) {
	var req models.CreateRouteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	route, err := req.Validate()
	if err != nil {
		respondBackendError(w, err)
		return
	}
	route.CreatedAt = time.Now().UTC()
	if err := s.table.Add(route); err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusCreated, map[string]interface{}{"route": route})
}

func (s *Server) deleteRoute(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]
	if err := s.table.Delete(name); err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"route": name, "deleted": true})
}

// =============================================================================
// Response helpers
// =============================================================================

func respondJSON(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}

// respondBackendError maps the model sentinels onto HTTP status codes so the
// client can tell a bad request from a missing route from a conflict.
func respondBackendError(w http.ResponseWriter, err error) {
	var ve *models.ValidationError
	switch {
	case errors.As(err, &ve):
		respondError(w, http.StatusBadRequest, ve.Error())
	case errors.Is(err, models.ErrNotFound):
		respondError(w, http.StatusNotFound, err.Error())
	case errors.Is(err, models.ErrAlreadyExists):
		respondError(w, http.StatusConflict, err.Error())
	default:
		respondError(w, http.StatusInternalServerError, err.Error())
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
