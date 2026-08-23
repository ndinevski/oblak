package api

import (
	"context"
	"encoding/json"
	"log"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/oblak/impuls/internal/function"
	"github.com/oblak/impuls/internal/models"
	"github.com/oblak/impuls/internal/telemetry"
)

// Server represents the API server
type Server struct {
	funcManager *function.Manager
	router      *mux.Router
	reporter    *invocationReporter
	// logger ships function stdout/stderr and errors to the telemetry store so
	// they are searchable in the dashboard's Logs view. nil until UseTelemetry
	// runs (the unit tests run without it), so every use is guarded.
	logger *slog.Logger
}

// NewServer creates a new API server
func NewServer(funcManager *function.Manager) *Server {
	s := &Server{
		funcManager: funcManager,
		router:      mux.NewRouter(),
		reporter:    newInvocationReporterFromEnv(),
	}

	s.setupRoutes()
	return s
}

// Router returns the HTTP router
func (s *Server) Router() *mux.Router {
	return s.router
}

// setupRoutes configures all API routes
func (s *Server) setupRoutes() {
	// API version prefix
	api := s.router.PathPrefix("/api/v1").Subrouter()

	// Health check
	s.router.HandleFunc("/health", s.healthCheck).Methods("GET")

	// Function routes
	api.HandleFunc("/functions", s.createFunction).Methods("POST")
	api.HandleFunc("/functions", s.listFunctions).Methods("GET")
	api.HandleFunc("/functions/{name}", s.getFunction).Methods("GET")
	api.HandleFunc("/functions/{name}", s.updateFunction).Methods("PUT", "PATCH")
	api.HandleFunc("/functions/{name}", s.deleteFunction).Methods("DELETE")
	api.HandleFunc("/functions/{name}/invoke", s.invokeFunction).Methods("POST")

	// VM routes (for debugging/admin)
	s.registerVMRoutes(api)

	// Access logging is handled by the telemetry middleware (see
	// UseTelemetry), which emits a trace-correlated record per request.
	s.router.Use(contentTypeMiddleware)
}

// UseTelemetry installs tracing, RED metrics and access logging on every
// route. Called after NewServer so a service can still run untraced, which is
// what the unit tests do.
func (s *Server) UseTelemetry(tel *telemetry.Telemetry, serviceName string) error {
	metrics, err := telemetry.NewHTTPMetrics(serviceName)
	if err != nil {
		return err
	}
	s.router.Use(tel.Middleware(serviceName, metrics))
	// Keep the logger so invocations can ship their runtime output to the
	// telemetry store, not only to Strapi.
	s.logger = tel.Logger
	return nil
}

// healthCheck handles health check requests
func (s *Server) healthCheck(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, map[string]string{
		"status":  "healthy",
		"service": "impuls",
	})
}

// createFunction handles function creation
func (s *Server) createFunction(w http.ResponseWriter, r *http.Request) {
	var req models.CreateFunctionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	fn, err := s.funcManager.Create(&req)
	if err != nil {
		if _, ok := err.(*models.ValidationError); ok {
			respondError(w, http.StatusBadRequest, err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, fn)
}

// listFunctions handles listing all functions
func (s *Server) listFunctions(w http.ResponseWriter, r *http.Request) {
	functions, err := s.funcManager.List()
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"functions": functions,
		"count":     len(functions),
	})
}

// getFunction handles getting a single function
func (s *Server) getFunction(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	name := vars["name"]

	fn, err := s.funcManager.Get(name)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, fn)
}

// updateFunction handles function updates
func (s *Server) updateFunction(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	name := vars["name"]

	var req models.UpdateFunctionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	fn, err := s.funcManager.Update(name, &req)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, fn)
}

// deleteFunction handles function deletion
func (s *Server) deleteFunction(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	name := vars["name"]

	if err := s.funcManager.Delete(name); err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"message": "Function deleted successfully",
		"name":    name,
	})
}

// invokeFunction handles function invocation
func (s *Server) invokeFunction(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	name := vars["name"]

	var payload interface{}
	if r.ContentLength > 0 {
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			respondError(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
			return
		}
	}

	// Check for local execution mode (for development/testing without Firecracker)
	useLocal := false
	if localRaw := r.URL.Query().Get("local"); localRaw != "" {
		if parsed, err := strconv.ParseBool(localRaw); err == nil {
			useLocal = parsed
		}
	}

	var response *models.InvocationResponse
	var err error

	if useLocal {
		response, err = s.funcManager.InvokeLocal(r.Context(), name, payload)
	} else {
		response, err = s.funcManager.Invoke(r.Context(), name, payload)
	}

	if err != nil {
		s.reportInvocation(invocationReportPayload{
			FunctionName:       name,
			Status:             "failure",
			ProviderStatusCode: http.StatusInternalServerError,
			ErrorMessage:       err.Error(),
			Local:              useLocal,
			InvokedAt:          time.Now().UTC(),
		})
		// The invocation never produced runtime logs (it failed to run at all),
		// so record the failure itself.
		s.emitFunctionLogs(r.Context(), name, useLocal, nil, err.Error(), 0)
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if response.Error != "" {
		s.reportInvocation(invocationReportPayload{
			FunctionName:       name,
			Status:             "failure",
			ProviderStatusCode: response.StatusCode,
			ExecutionTimeMs:    response.Duration,
			RuntimeLogs:        response.Logs,
			ErrorMessage:       response.Error,
			Local:              useLocal,
			InvokedAt:          time.Now().UTC(),
		})
		s.emitFunctionLogs(r.Context(), name, useLocal, response.Logs, response.Error, response.Duration)
		respondError(w, response.StatusCode, response.Error)
		return
	}

	s.reportInvocation(invocationReportPayload{
		FunctionName:       name,
		Status:             "success",
		ProviderStatusCode: response.StatusCode,
		ExecutionTimeMs:    response.Duration,
		RuntimeLogs:        response.Logs,
		Response:           response.Body,
		Local:              useLocal,
		InvokedAt:          time.Now().UTC(),
	})
	s.emitFunctionLogs(r.Context(), name, useLocal, response.Logs, "", response.Duration)

	// Return only function body using function status code.
	respondJSON(w, response.StatusCode, response.Body)
}

func (s *Server) reportInvocation(payload invocationReportPayload) {
	if s.reporter == nil {
		return
	}

	go func() {
		if err := s.reporter.Send(payload); err != nil {
			log.Printf("Failed to report invocation to Strapi: %v", err)
		}
	}()
}

// emitFunctionLogs ships a function invocation's runtime output to the telemetry
// store, so a function's own console output and thrown errors are searchable in
// the dashboard's Logs view rather than only being returned to the caller.
//
// A function runs the operator's own code, which carries no Oblak telemetry, so
// without this its logs are invisible the moment the HTTP response is sent. Each
// captured stdout line becomes an INFO record and each stderr line a WARN; a
// thrown error becomes an ERROR record carrying the message. Every record is
// tagged with the function name (faas.name) and, being emitted in the request
// context, carries the invocation's trace id, so a function's logs sit on the
// same trace as the invoke request that produced them.
func (s *Server) emitFunctionLogs(ctx context.Context, name string, local bool, logs *models.InvocationLogs, errMsg string, durationMs int64) {
	if s.logger == nil {
		return
	}

	base := []slog.Attr{
		slog.String("faas.name", name),
		slog.String("faas.trigger", "http"),
		slog.Bool("faas.local", local),
	}
	if durationMs > 0 {
		base = append(base, slog.Int64("faas.duration_ms", durationMs))
	}
	// withAttr returns base plus one more attribute, without mutating base's
	// backing array (append could otherwise clobber a shared slice).
	withAttr := func(extra slog.Attr) []slog.Attr {
		out := make([]slog.Attr, len(base), len(base)+1)
		copy(out, base)
		return append(out, extra)
	}

	if logs != nil {
		for _, line := range logs.Stdout {
			if strings.TrimSpace(line) == "" {
				continue
			}
			s.logger.LogAttrs(ctx, slog.LevelInfo, line, withAttr(slog.String("faas.stream", "stdout"))...)
		}
		for _, line := range logs.Stderr {
			if strings.TrimSpace(line) == "" {
				continue
			}
			s.logger.LogAttrs(ctx, slog.LevelWarn, line, withAttr(slog.String("faas.stream", "stderr"))...)
		}
	}

	if errMsg != "" {
		s.logger.LogAttrs(ctx, slog.LevelError, "function invocation failed", withAttr(slog.String("error", errMsg))...)
	}
}

// respondJSON sends a JSON response
func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("Failed to encode JSON response: %v", err)
	}
}

// respondError sends an error response
func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]interface{}{
		"error":   true,
		"message": message,
	})
}

// loggingMiddleware logs all requests
// contentTypeMiddleware sets default content type
func contentTypeMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		next.ServeHTTP(w, r)
	})
}
