package api

import (
	"net/http"

	"github.com/gorilla/mux"
)

// registerVMRoutes registers VM-related routes (for debugging/admin)
func (s *Server) registerVMRoutes(api *mux.Router) {
	// These routes are optional and can be used for debugging
	// They expose Firecracker VM management directly
	
	api.HandleFunc("/vms", s.listVMs).Methods("GET")
	api.HandleFunc("/vms/{id}", s.getVM).Methods("GET")
	api.HandleFunc("/vms/{id}", s.stopVM).Methods("DELETE")
}

// listVMs lists all running VMs
func (s *Server) listVMs(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement when VM pool is integrated
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"vms":   []interface{}{},
		"count": 0,
	})
}

// getVM gets details of a specific VM
func (s *Server) getVM(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	_ = vars["id"]

	// TODO: Implement when VM pool is integrated
	respondError(w, http.StatusNotFound, "VM not found")
}

// stopVM stops a specific VM
func (s *Server) stopVM(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	_ = vars["id"]

	// TODO: Implement when VM pool is integrated
	respondError(w, http.StatusNotFound, "VM not found")
}
