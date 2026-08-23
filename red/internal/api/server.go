// Package api is Red's HTTP surface: queues, messages, and backups.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/gorilla/mux"
	"github.com/rs/cors"

	"github.com/oblak/red/internal/models"
	"github.com/oblak/red/internal/store"
	"github.com/oblak/red/internal/telemetry"
)

// Server is the Red API server.
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
		Port:      envOr("RED_PORT", "8087"),
		DataFile:  envOr("RED_DATA_FILE", "/var/lib/red/red.db"),
		BackupDir: envOr("RED_BACKUP_DIR", "/var/lib/red/backups"),
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

// Store exposes the store, so the sweeper can share the server's instance.
func (s *Server) Store() store.Store { return s.store }

func (s *Server) setupRoutes() {
	s.router.HandleFunc("/health", s.health).Methods("GET")

	api := s.router.PathPrefix("/api/v1").Subrouter()

	// Backups (literal /restore before /:id).
	api.HandleFunc("/backups", s.listBackups).Methods("GET")
	api.HandleFunc("/backups/restore", s.restoreBackup).Methods("POST")
	api.HandleFunc("/backups/{id}", s.getBackup).Methods("GET")
	api.HandleFunc("/backups/{id}", s.deleteBackup).Methods("DELETE")

	// Queues.
	api.HandleFunc("/queues", s.listQueues).Methods("GET")
	api.HandleFunc("/queues", s.createQueue).Methods("POST")
	api.HandleFunc("/queues/{queue}", s.getQueue).Methods("GET")
	api.HandleFunc("/queues/{queue}", s.updateQueue).Methods("PATCH")
	api.HandleFunc("/queues/{queue}", s.deleteQueue).Methods("DELETE")
	api.HandleFunc("/queues/{queue}/stats", s.queueStats).Methods("GET")
	api.HandleFunc("/queues/{queue}/purge", s.purgeQueue).Methods("POST")

	// Messages.
	api.HandleFunc("/queues/{queue}/messages", s.sendMessage).Methods("POST")
	api.HandleFunc("/queues/{queue}/messages/receive", s.receiveMessages).Methods("POST")
	api.HandleFunc("/queues/{queue}/messages/delete", s.deleteMessage).Methods("POST")
	api.HandleFunc("/queues/{queue}/messages/visibility", s.changeVisibility).Methods("POST")

	// Per-queue backups.
	api.HandleFunc("/queues/{queue}/backups", s.listQueueBackups).Methods("GET")
	api.HandleFunc("/queues/{queue}/backups", s.createBackup).Methods("POST")

	// Subscriptions (Impuls triggers).
	api.HandleFunc("/subscriptions", s.listSubscriptions).Methods("GET")
	api.HandleFunc("/subscriptions", s.createSubscription).Methods("POST")
	api.HandleFunc("/subscriptions/{name}", s.getSubscription).Methods("GET")
	api.HandleFunc("/subscriptions/{name}", s.updateSubscription).Methods("PATCH")
	api.HandleFunc("/subscriptions/{name}", s.deleteSubscription).Methods("DELETE")
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
	status, storeState, queues := "healthy", "connected", 0
	if err := s.store.Health(r.Context()); err != nil {
		status, storeState = "degraded", "unavailable"
	} else if list, err := s.store.ListQueues(r.Context()); err == nil {
		queues = len(list)
	}
	code := http.StatusOK
	if status != "healthy" {
		code = http.StatusServiceUnavailable
	}
	respondJSON(w, code, map[string]interface{}{
		"service": "red", "status": status, "store": storeState, "queues": queues,
	})
}

// =============================================================================
// Handlers: queues
// =============================================================================

func (s *Server) listQueues(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.ListQueues(r.Context())
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"queues": list, "count": len(list)})
}

func (s *Server) getQueue(w http.ResponseWriter, r *http.Request) {
	q, err := s.store.GetQueue(r.Context(), mux.Vars(r)["queue"])
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"queue": q})
}

func (s *Server) createQueue(w http.ResponseWriter, r *http.Request) {
	var req models.CreateQueueRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	q, err := req.Validate()
	if err != nil {
		respondBackendError(w, err)
		return
	}
	created, err := s.store.CreateQueue(r.Context(), q)
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusCreated, map[string]interface{}{"queue": created})
}

func (s *Server) updateQueue(w http.ResponseWriter, r *http.Request) {
	var req models.UpdateQueueRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	q, err := s.store.UpdateQueue(r.Context(), mux.Vars(r)["queue"], &req)
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"queue": q})
}

func (s *Server) deleteQueue(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["queue"]
	if err := s.store.DeleteQueue(r.Context(), name); err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"queue": name, "deleted": true})
}

func (s *Server) queueStats(w http.ResponseWriter, r *http.Request) {
	stats, err := s.store.Stats(r.Context(), mux.Vars(r)["queue"])
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, stats)
}

func (s *Server) purgeQueue(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["queue"]
	purged, err := s.store.PurgeQueue(r.Context(), name)
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"queue": name, "purged": purged})
}

// =============================================================================
// Handlers: messages
// =============================================================================

func (s *Server) sendMessage(w http.ResponseWriter, r *http.Request) {
	queue := mux.Vars(r)["queue"]
	var req models.SendMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := req.Validate(); err != nil {
		respondBackendError(w, err)
		return
	}
	now := time.Now()
	msg := &models.Message{
		ID:           models.NewMessageID(),
		Body:         req.Body,
		Attributes:   req.Attributes,
		EnqueuedAt:   now.UnixMilli(),
		TraceContext: extractTraceContext(r),
	}
	visibleAt := now.Add(time.Duration(req.DelaySeconds) * time.Second)
	if err := s.store.SendMessage(r.Context(), queue, msg, visibleAt); err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusCreated, map[string]interface{}{"message_id": msg.ID})
}

func (s *Server) receiveMessages(w http.ResponseWriter, r *http.Request) {
	queue := mux.Vars(r)["queue"]
	var req models.ReceiveMessagesRequest
	if r.Body != nil && r.ContentLength != 0 {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			respondError(w, http.StatusBadRequest, "invalid request body")
			return
		}
	}
	req.Normalize()

	visibility := time.Duration(req.VisibilityTimeoutSeconds) * time.Second

	// Long polling: try immediately, then poll on a short interval until a
	// message arrives or the wait budget (or the request context) is spent.
	deadline := time.Now().Add(time.Duration(req.WaitTimeSeconds) * time.Second)
	for {
		msgs, err := s.store.Receive(r.Context(), queue, req.MaxMessages, time.Now(), visibility)
		if err != nil {
			respondBackendError(w, err)
			return
		}
		if len(msgs) > 0 || req.WaitTimeSeconds == 0 || time.Now().After(deadline) {
			if msgs == nil {
				// Always return a JSON array, never null, so clients can rely
				// on the shape.
				msgs = []models.Message{}
			}
			respondJSON(w, http.StatusOK, map[string]interface{}{"messages": msgs, "count": len(msgs)})
			return
		}
		select {
		case <-r.Context().Done():
			respondJSON(w, http.StatusOK, map[string]interface{}{"messages": []models.Message{}, "count": 0})
			return
		case <-time.After(500 * time.Millisecond):
		}
	}
}

func (s *Server) deleteMessage(w http.ResponseWriter, r *http.Request) {
	queue := mux.Vars(r)["queue"]
	var req models.DeleteMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := req.Validate(); err != nil {
		respondBackendError(w, err)
		return
	}
	if err := s.store.Delete(r.Context(), queue, req.ReceiptHandle); err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"deleted": true})
}

func (s *Server) changeVisibility(w http.ResponseWriter, r *http.Request) {
	queue := mux.Vars(r)["queue"]
	var req struct {
		ReceiptHandle            string `json:"receipt_handle"`
		VisibilityTimeoutSeconds int    `json:"visibility_timeout_seconds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ReceiptHandle == "" {
		respondError(w, http.StatusBadRequest, "receipt_handle is required")
		return
	}
	err := s.store.ChangeVisibility(r.Context(), queue, req.ReceiptHandle, time.Now(),
		time.Duration(req.VisibilityTimeoutSeconds)*time.Second)
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"changed": true})
}

// =============================================================================
// Handlers: backups
// =============================================================================

func (s *Server) createBackup(w http.ResponseWriter, r *http.Request) {
	backup, err := s.store.CreateBackup(r.Context(), mux.Vars(r)["queue"])
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusCreated, backup)
}

func (s *Server) listBackups(w http.ResponseWriter, r *http.Request) {
	backups, err := s.store.ListBackups(r.Context(), r.URL.Query().Get("queue"))
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondWithBackups(w, backups)
}

func (s *Server) listQueueBackups(w http.ResponseWriter, r *http.Request) {
	queue := mux.Vars(r)["queue"]
	if _, err := s.store.GetQueue(r.Context(), queue); err != nil {
		respondBackendError(w, err)
		return
	}
	backups, err := s.store.ListBackups(r.Context(), queue)
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
	queue, err := s.store.RestoreBackup(r.Context(), req.BackupID, req.TargetQueue)
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"restored": true, "queue": queue, "backup_id": req.BackupID})
}

// =============================================================================
// Handlers: subscriptions
// =============================================================================

func (s *Server) listSubscriptions(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.ListSubscriptions(r.Context())
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"subscriptions": list, "count": len(list)})
}

func (s *Server) getSubscription(w http.ResponseWriter, r *http.Request) {
	sub, err := s.store.GetSubscription(r.Context(), mux.Vars(r)["name"])
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"subscription": sub})
}

func (s *Server) createSubscription(w http.ResponseWriter, r *http.Request) {
	var req models.CreateSubscriptionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	sub, err := req.Validate()
	if err != nil {
		respondBackendError(w, err)
		return
	}
	created, err := s.store.CreateSubscription(r.Context(), sub)
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusCreated, map[string]interface{}{"subscription": created})
}

func (s *Server) updateSubscription(w http.ResponseWriter, r *http.Request) {
	var req models.UpdateSubscriptionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	sub, err := s.store.UpdateSubscription(r.Context(), mux.Vars(r)["name"], &req)
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"subscription": sub})
}

func (s *Server) deleteSubscription(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]
	if err := s.store.DeleteSubscription(r.Context(), name); err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"subscription": name, "deleted": true})
}

// =============================================================================
// Helpers
// =============================================================================

// extractTraceContext copies W3C trace headers off the send request so they
// travel with the message and a consumer can continue the producer's trace.
func extractTraceContext(r *http.Request) map[string]string {
	out := map[string]string{}
	for _, h := range []string{"traceparent", "tracestate"} {
		if v := r.Header.Get(h); v != "" {
			out[h] = v
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
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
