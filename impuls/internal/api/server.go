package api

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/oblak/impuls/internal/function"
	"github.com/oblak/impuls/internal/models"
)

// Server represents the API server
type Server struct {
	funcManager *function.Manager
	router      *mux.Router
}

// NewServer creates a new API server
func NewServer(funcManager *function.Manager) *Server {
	s := &Server{
		funcManager: funcManager,
		router:      mux.NewRouter(),
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

	// Add middleware
	s.router.Use(loggingMiddleware)
	s.router.Use(contentTypeMiddleware)
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
	useLocal := r.URL.Query().Get("local") == "true"

	var response *models.InvocationResponse
	var err error

	if useLocal {
		response, err = s.funcManager.InvokeLocal(r.Context(), name, payload)
	} else {
		response, err = s.funcManager.Invoke(r.Context(), name, payload)
	}

	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Return the invocation response
	w.Header().Set("X-Impuls-Duration", string(rune(response.Duration)))
	respondJSON(w, response.StatusCode, response)
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
func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("%s %s %s", r.Method, r.URL.Path, r.RemoteAddr)
		next.ServeHTTP(w, r)
	})
}

// contentTypeMiddleware sets default content type
func contentTypeMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		next.ServeHTTP(w, r)
	})
}
