// Package api is Indeks's HTTP surface: tables, items, queries and backups.
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

	"github.com/oblak/indeks/internal/models"
	"github.com/oblak/indeks/internal/store"
	"github.com/oblak/indeks/internal/telemetry"
)

// Server is the Indeks API server.
type Server struct {
	router *mux.Router
	store  store.Store
	port   string
}

// Config holds server configuration.
type Config struct {
	Port      string
	DataFile  string
	BackupDir string
}

// GetConfigFromEnv reads configuration from the environment.
func GetConfigFromEnv() Config {
	return Config{
		Port:      envOr("INDEKS_PORT", "8086"),
		DataFile:  envOr("INDEKS_DATA_FILE", "/var/lib/indeks/indeks.db"),
		BackupDir: envOr("INDEKS_BACKUP_DIR", "/var/lib/indeks/backups"),
	}
}

// NewServer builds a server backed by an embedded bbolt store.
func NewServer(cfg Config) (*Server, error) {
	st, err := store.NewBoltStore(cfg.DataFile, cfg.BackupDir)
	if err != nil {
		return nil, err
	}
	return NewServerWithStore(cfg, st), nil
}

// NewServerWithStore builds a server over any Store, used by the tests.
func NewServerWithStore(cfg Config, st store.Store) *Server {
	s := &Server{router: mux.NewRouter(), store: st, port: cfg.Port}
	s.setupRoutes()
	return s
}

func (s *Server) setupRoutes() {
	s.router.HandleFunc("/health", s.health).Methods("GET")

	api := s.router.PathPrefix("/api/v1").Subrouter()

	// Backups. Literal /restore before /{id} so it is not read as an id.
	api.HandleFunc("/backups", s.listBackups).Methods("GET")
	api.HandleFunc("/backups/restore", s.restoreBackup).Methods("POST")
	api.HandleFunc("/backups/{id}", s.getBackup).Methods("GET")
	api.HandleFunc("/backups/{id}", s.deleteBackup).Methods("DELETE")

	// Tables.
	api.HandleFunc("/tables", s.listTables).Methods("GET")
	api.HandleFunc("/tables", s.createTable).Methods("POST")
	api.HandleFunc("/tables/{table}", s.getTable).Methods("GET")
	api.HandleFunc("/tables/{table}", s.deleteTable).Methods("DELETE")

	// Items. put-item, get/delete by key, query and scan.
	api.HandleFunc("/tables/{table}/items", s.putItem).Methods("PUT", "POST")
	api.HandleFunc("/tables/{table}/get", s.getItem).Methods("POST")
	api.HandleFunc("/tables/{table}/delete", s.deleteItem).Methods("POST")
	api.HandleFunc("/tables/{table}/query", s.query).Methods("POST")
	api.HandleFunc("/tables/{table}/scan", s.scan).Methods("GET")

	// Per-table backups.
	api.HandleFunc("/tables/{table}/backups", s.listTableBackups).Methods("GET")
	api.HandleFunc("/tables/{table}/backups", s.createBackup).Methods("POST")
}

// UseTelemetry installs tracing, RED metrics and access logging.
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

func (s *Server) Port() string { return s.port }

func (s *Server) Close() error {
	if s.store != nil {
		return s.store.Close()
	}
	return nil
}

// LogBackendStatus records store reachability at startup.
func (s *Server) LogBackendStatus(ctx context.Context, logger *slog.Logger) {
	if err := s.store.Health(ctx); err != nil {
		logger.Warn("store unavailable at startup", "error", err)
	} else {
		logger.Info("store ready")
	}
}

// =============================================================================
// Handlers: service
// =============================================================================

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	status := "healthy"
	storeState := "connected"
	tables := 0
	if err := s.store.Health(r.Context()); err != nil {
		status = "degraded"
		storeState = "unavailable"
	} else if list, err := s.store.ListTables(r.Context()); err == nil {
		tables = len(list)
	}
	code := http.StatusOK
	if status != "healthy" {
		code = http.StatusServiceUnavailable
	}
	respondJSON(w, code, map[string]interface{}{
		"service": "indeks",
		"status":  status,
		"store":   storeState,
		"tables":  tables,
	})
}

// =============================================================================
// Handlers: tables
// =============================================================================

func (s *Server) listTables(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.ListTables(r.Context())
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"tables": list, "count": len(list)})
}

func (s *Server) getTable(w http.ResponseWriter, r *http.Request) {
	table, err := s.store.GetTable(r.Context(), mux.Vars(r)["table"])
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"table": table})
}

func (s *Server) createTable(w http.ResponseWriter, r *http.Request) {
	var req models.CreateTableRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	schema, err := req.Validate()
	if err != nil {
		respondBackendError(w, err)
		return
	}
	table, err := s.store.CreateTable(r.Context(), req.Name, *schema)
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusCreated, map[string]interface{}{"table": table})
}

func (s *Server) deleteTable(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["table"]
	if err := s.store.DeleteTable(r.Context(), name); err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"table": name, "deleted": true})
}

// =============================================================================
// Handlers: items
// =============================================================================

func (s *Server) putItem(w http.ResponseWriter, r *http.Request) {
	table := mux.Vars(r)["table"]
	var req models.PutItemRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.Item) == 0 {
		respondError(w, http.StatusBadRequest, "item is required")
		return
	}
	if err := s.store.PutItem(r.Context(), table, req.Item); err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"item": req.Item})
}

// keyRequest is the body for get/delete by key.
type keyRequest struct {
	PartitionValue interface{} `json:"partition_value"`
	SortValue      interface{} `json:"sort_value,omitempty"`
}

func (s *Server) getItem(w http.ResponseWriter, r *http.Request) {
	table := mux.Vars(r)["table"]
	var req keyRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	item, err := s.store.GetItem(r.Context(), table, req.PartitionValue, req.SortValue)
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"item": item})
}

func (s *Server) deleteItem(w http.ResponseWriter, r *http.Request) {
	table := mux.Vars(r)["table"]
	var req keyRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := s.store.DeleteItem(r.Context(), table, req.PartitionValue, req.SortValue); err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"deleted": true})
}

func (s *Server) query(w http.ResponseWriter, r *http.Request) {
	table := mux.Vars(r)["table"]
	var req models.QueryRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.PartitionValue == nil {
		respondError(w, http.StatusBadRequest, "partition_value is required")
		return
	}
	result, err := s.store.Query(r.Context(), table, &req)
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, result)
}

func (s *Server) scan(w http.ResponseWriter, r *http.Request) {
	table := mux.Vars(r)["table"]
	limit := 0
	if raw := r.URL.Query().Get("limit"); raw != "" {
		limit, _ = strconv.Atoi(raw)
	}
	result, err := s.store.Scan(r.Context(), table, limit)
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, result)
}

// =============================================================================
// Handlers: backups
// =============================================================================

func (s *Server) createBackup(w http.ResponseWriter, r *http.Request) {
	table := mux.Vars(r)["table"]
	backup, err := s.store.CreateBackup(r.Context(), table)
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusCreated, backup)
}

func (s *Server) listBackups(w http.ResponseWriter, r *http.Request) {
	table := r.URL.Query().Get("table")
	backups, err := s.store.ListBackups(r.Context(), table)
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondWithBackups(w, backups)
}

func (s *Server) listTableBackups(w http.ResponseWriter, r *http.Request) {
	table := mux.Vars(r)["table"]
	if _, err := s.store.GetTable(r.Context(), table); err != nil {
		respondBackendError(w, err)
		return
	}
	backups, err := s.store.ListBackups(r.Context(), table)
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondWithBackups(w, backups)
}

func respondWithBackups(w http.ResponseWriter, backups []models.Backup) {
	var total int64
	for _, b := range backups {
		total += b.SizeBytes
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"backups": backups, "count": len(backups), "total_size": total,
	})
}

func (s *Server) getBackup(w http.ResponseWriter, r *http.Request) {
	backup, err := s.store.GetBackup(r.Context(), mux.Vars(r)["id"])
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, backup)
}

func (s *Server) deleteBackup(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	if err := s.store.DeleteBackup(r.Context(), id); err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"backup_id": id, "deleted": true})
}

func (s *Server) restoreBackup(w http.ResponseWriter, r *http.Request) {
	var req models.RestoreBackupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := req.Validate(); err != nil {
		respondBackendError(w, err)
		return
	}
	table, err := s.store.RestoreBackup(r.Context(), req.BackupID, req.TargetTable)
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"restored": true, "table": table, "backup_id": req.BackupID,
	})
}

// =============================================================================
// Helpers
// =============================================================================

// decodeJSON decodes a request body, using json.Number so numeric key values
// keep their precision and are recognisable as numbers by the store.
func decodeJSON(r *http.Request, v interface{}) error {
	dec := json.NewDecoder(r.Body)
	dec.UseNumber()
	return dec.Decode(v)
}

func respondJSON(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}

func respondBackendError(w http.ResponseWriter, err error) {
	var ve *models.ValidationError
	switch {
	case errors.As(err, &ve):
		respondError(w, http.StatusBadRequest, ve.Error())
	case errors.Is(err, models.ErrNotFound):
		respondError(w, http.StatusNotFound, err.Error())
	case errors.Is(err, models.ErrAlreadyExists):
		respondError(w, http.StatusConflict, err.Error())
	case errors.Is(err, models.ErrConflict):
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
