package api

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/oblak/izvor/internal/models"
)

// =============================================================================
// VM Routes
// =============================================================================

// listVMs handles GET /api/v1/vms
func (s *Server) listVMs(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	node := r.URL.Query().Get("node")

	vms, err := s.proxmox.ListVMs(ctx, node)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"vms":   vms,
		"count": len(vms),
	})
}

// createVM handles POST /api/v1/vms
func (s *Server) createVM(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req models.CreateVMRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	if err := req.Validate(); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	vm, vmid, err := s.proxmox.CreateVM(ctx, &req)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"vm":   vm,
		"vmid": vmid,
	})
}

// getVM handles GET /api/v1/vms/{id}
func (s *Server) getVM(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	vmid := vars["id"]
	node := r.URL.Query().Get("node")

	// If node is not specified, try to find the VM across all nodes
	if node == "" {
		vms, err := s.proxmox.ListVMs(ctx, "")
		if err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
		for _, vm := range vms {
			if vm.ID == vmid {
				node = vm.Node
				break
			}
		}
		if node == "" {
			respondError(w, http.StatusNotFound, "VM not found")
			return
		}
	}

	vm, err := s.proxmox.GetVM(ctx, node, vmid)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, vm)
}

// updateVM handles PUT/PATCH /api/v1/vms/{id}
func (s *Server) updateVM(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	vmid := vars["id"]
	node := r.URL.Query().Get("node")

	// Find VM node if not specified
	if node == "" {
		vms, err := s.proxmox.ListVMs(ctx, "")
		if err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
		for _, vm := range vms {
			if vm.ID == vmid {
				node = vm.Node
				break
			}
		}
		if node == "" {
			respondError(w, http.StatusNotFound, "VM not found")
			return
		}
	}

	var req models.UpdateVMRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	// TODO: Implement VM update in proxmox client
	// For now, just return the current VM state
	vm, err := s.proxmox.GetVM(ctx, node, vmid)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, vm)
}

// deleteVM handles DELETE /api/v1/vms/{id}
func (s *Server) deleteVM(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	vmid := vars["id"]
	node := r.URL.Query().Get("node")

	// Find VM node if not specified
	if node == "" {
		vms, err := s.proxmox.ListVMs(ctx, "")
		if err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
		for _, vm := range vms {
			if vm.ID == vmid {
				node = vm.Node
				break
			}
		}
		if node == "" {
			respondError(w, http.StatusNotFound, "VM not found")
			return
		}
	}

	if err := s.proxmox.DeleteVM(ctx, node, vmid); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"message": "VM deleted successfully",
		"vmid":    vmid,
	})
}

// vmAction handles POST /api/v1/vms/{id}/actions
func (s *Server) vmAction(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	vmid := vars["id"]
	node := r.URL.Query().Get("node")

	// Find VM node if not specified
	if node == "" {
		vms, err := s.proxmox.ListVMs(ctx, "")
		if err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
		for _, vm := range vms {
			if vm.ID == vmid {
				node = vm.Node
				break
			}
		}
		if node == "" {
			respondError(w, http.StatusNotFound, "VM not found")
			return
		}
	}

	var req models.VMActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	if err := req.Validate(); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	var upid string
	var err error

	switch req.Action {
	case models.ActionStart:
		upid, err = s.proxmox.StartVM(ctx, node, vmid)
	case models.ActionStop:
		upid, err = s.proxmox.StopVM(ctx, node, vmid, req.Force)
	case models.ActionShutdown:
		upid, err = s.proxmox.StopVM(ctx, node, vmid, false)
	case models.ActionReboot:
		upid, err = s.proxmox.RebootVM(ctx, node, vmid)
	case models.ActionReset:
		upid, err = s.proxmox.ResetVM(ctx, node, vmid)
	case models.ActionSuspend:
		upid, err = s.proxmox.SuspendVM(ctx, node, vmid)
	case models.ActionResume:
		upid, err = s.proxmox.ResumeVM(ctx, node, vmid)
	case models.ActionSnapshot:
		snapshot, snapErr := s.proxmox.CreateSnapshot(ctx, node, vmid, &models.CreateSnapshotRequest{
			Name: req.SnapshotName,
		})
		if snapErr != nil {
			respondError(w, http.StatusInternalServerError, snapErr.Error())
			return
		}
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"action":   req.Action,
			"snapshot": snapshot,
		})
		return
	case models.ActionClone:
		cloneReq := &models.CreateVMRequest{
			Name:     req.CloneName,
			Template: vmid,
		}
		newVM, newVMID, cloneErr := s.proxmox.CreateVM(ctx, cloneReq)
		if cloneErr != nil {
			respondError(w, http.StatusInternalServerError, cloneErr.Error())
			return
		}
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"action": req.Action,
			"vm":     newVM,
			"vmid":   newVMID,
		})
		return
	default:
		respondError(w, http.StatusBadRequest, "Unknown action: "+string(req.Action))
		return
	}

	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"action":  req.Action,
		"vmid":    vmid,
		"task_id": upid,
	})
}

// getVMConsole handles GET /api/v1/vms/{id}/console
func (s *Server) getVMConsole(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	vmid := vars["id"]
	node := r.URL.Query().Get("node")

	// Find VM node if not specified
	if node == "" {
		vms, err := s.proxmox.ListVMs(ctx, "")
		if err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
		for _, vm := range vms {
			if vm.ID == vmid {
				node = vm.Node
				break
			}
		}
		if node == "" {
			respondError(w, http.StatusNotFound, "VM not found")
			return
		}
	}

	console, err := s.proxmox.GetVNCConsole(ctx, node, vmid)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, console)
}

// listVMSizes handles GET /api/v1/vms/sizes
func (s *Server) listVMSizes(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"sizes": models.PredefinedSizes,
	})
}

// =============================================================================
// Snapshot Routes
// =============================================================================

// listSnapshots handles GET /api/v1/vms/{id}/snapshots
func (s *Server) listSnapshots(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	vmid := vars["id"]
	node := r.URL.Query().Get("node")

	// Find VM node if not specified
	if node == "" {
		vms, err := s.proxmox.ListVMs(ctx, "")
		if err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
		for _, vm := range vms {
			if vm.ID == vmid {
				node = vm.Node
				break
			}
		}
		if node == "" {
			respondError(w, http.StatusNotFound, "VM not found")
			return
		}
	}

	snapshots, err := s.proxmox.ListSnapshots(ctx, node, vmid)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"snapshots": snapshots,
		"count":     len(snapshots),
	})
}

// createSnapshot handles POST /api/v1/vms/{id}/snapshots
func (s *Server) createSnapshot(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	vmid := vars["id"]
	node := r.URL.Query().Get("node")

	// Find VM node if not specified
	if node == "" {
		vms, err := s.proxmox.ListVMs(ctx, "")
		if err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
		for _, vm := range vms {
			if vm.ID == vmid {
				node = vm.Node
				break
			}
		}
		if node == "" {
			respondError(w, http.StatusNotFound, "VM not found")
			return
		}
	}

	var req models.CreateSnapshotRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	if err := req.Validate(); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	snapshot, err := s.proxmox.CreateSnapshot(ctx, node, vmid, &req)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, snapshot)
}

// deleteSnapshot handles DELETE /api/v1/vms/{id}/snapshots/{name}
func (s *Server) deleteSnapshot(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	vmid := vars["id"]
	snapname := vars["name"]
	node := r.URL.Query().Get("node")

	// Find VM node if not specified
	if node == "" {
		vms, err := s.proxmox.ListVMs(ctx, "")
		if err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
		for _, vm := range vms {
			if vm.ID == vmid {
				node = vm.Node
				break
			}
		}
		if node == "" {
			respondError(w, http.StatusNotFound, "VM not found")
			return
		}
	}

	if err := s.proxmox.DeleteSnapshot(ctx, node, vmid, snapname); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"message":  "Snapshot deleted successfully",
		"snapshot": snapname,
	})
}

// rollbackSnapshot handles POST /api/v1/vms/{id}/snapshots/{name}/rollback
func (s *Server) rollbackSnapshot(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	vmid := vars["id"]
	snapname := vars["name"]
	node := r.URL.Query().Get("node")

	// Find VM node if not specified
	if node == "" {
		vms, err := s.proxmox.ListVMs(ctx, "")
		if err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
		for _, vm := range vms {
			if vm.ID == vmid {
				node = vm.Node
				break
			}
		}
		if node == "" {
			respondError(w, http.StatusNotFound, "VM not found")
			return
		}
	}

	if err := s.proxmox.RollbackSnapshot(ctx, node, vmid, snapname); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"message":  "Rolled back to snapshot successfully",
		"snapshot": snapname,
	})
}

// =============================================================================
// Template Routes
// =============================================================================

// listTemplates handles GET /api/v1/templates
func (s *Server) listTemplates(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	templates, err := s.proxmox.ListTemplates(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"templates": templates,
		"count":     len(templates),
	})
}

// =============================================================================
// Node Routes
// =============================================================================

// listNodes handles GET /api/v1/nodes
func (s *Server) listNodes(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	nodes, err := s.proxmox.ListNodes(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Count VMs per node
	for i := range nodes {
		vms, err := s.proxmox.ListVMs(ctx, nodes[i].Name)
		if err == nil {
			nodes[i].VMCount = len(vms)
			for _, vm := range vms {
				if vm.Status == models.VMStatusRunning {
					nodes[i].RunningVMs++
				}
			}
		}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"nodes": nodes,
		"count": len(nodes),
	})
}

// getNode handles GET /api/v1/nodes/{name}
func (s *Server) getNode(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	nodeName := vars["name"]

	nodes, err := s.proxmox.ListNodes(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	for _, node := range nodes {
		if node.Name == nodeName {
			// Count VMs
			vms, err := s.proxmox.ListVMs(ctx, nodeName)
			if err == nil {
				node.VMCount = len(vms)
				for _, vm := range vms {
					if vm.Status == models.VMStatusRunning {
						node.RunningVMs++
					}
				}
			}
			respondJSON(w, http.StatusOK, node)
			return
		}
	}

	respondError(w, http.StatusNotFound, "Node not found")
}

// listNodeStorage handles GET /api/v1/nodes/{name}/storage
func (s *Server) listNodeStorage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	nodeName := vars["name"]

	storages, err := s.proxmox.ListStorages(ctx, nodeName)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"storage": storages,
		"count":   len(storages),
	})
}

// listNodeNetworks handles GET /api/v1/nodes/{name}/networks
func (s *Server) listNodeNetworks(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	nodeName := vars["name"]

	networks, err := s.proxmox.ListNetworks(ctx, nodeName)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"networks": networks,
		"count":    len(networks),
	})
}

// =============================================================================
// Cluster Routes
// =============================================================================

// getClusterStatus handles GET /api/v1/cluster/status
func (s *Server) getClusterStatus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	version, err := s.proxmox.GetVersion(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	nodes, err := s.proxmox.ListNodes(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	onlineNodes := 0
	for _, node := range nodes {
		if node.Status == "online" {
			onlineNodes++
		}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":        "healthy",
		"version":       version,
		"total_nodes":   len(nodes),
		"online_nodes":  onlineNodes,
		"offline_nodes": len(nodes) - onlineNodes,
	})
}

// getClusterResources handles GET /api/v1/cluster/resources
func (s *Server) getClusterResources(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	nodes, err := s.proxmox.ListNodes(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var summary models.ResourceSummary
	summary.Nodes = nodes

	for _, node := range nodes {
		summary.TotalCores += node.Cores
		summary.TotalMemory += node.Memory
		summary.UsedMemory += node.MemoryUsed

		// Get VMs for this node
		vms, err := s.proxmox.ListVMs(ctx, node.Name)
		if err == nil {
			for _, vm := range vms {
				summary.TotalVMs++
				summary.UsedCores += vm.Cores
				if vm.Status == models.VMStatusRunning {
					summary.RunningVMs++
				} else {
					summary.StoppedVMs++
				}
			}
		}
	}

	// Calculate percentages
	if summary.TotalMemory > 0 {
		summary.MemoryUsagePercent = float64(summary.UsedMemory) / float64(summary.TotalMemory) * 100
	}
	if summary.TotalCores > 0 {
		summary.CPUUsagePercent = float64(summary.UsedCores) / float64(summary.TotalCores) * 100
	}

	respondJSON(w, http.StatusOK, summary)
}

// =============================================================================
// Storage Routes
// =============================================================================

// listStorage handles GET /api/v1/storage
func (s *Server) listStorage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Get storage from all nodes
	nodes, err := s.proxmox.ListNodes(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var allStorages []models.Storage
	seen := make(map[string]bool)

	for _, node := range nodes {
		storages, err := s.proxmox.ListStorages(ctx, node.Name)
		if err != nil {
			continue
		}
		for _, storage := range storages {
			// Avoid duplicates for shared storage
			key := storage.Name
			if !storage.Shared {
				key = storage.Node + ":" + storage.Name
			}
			if !seen[key] {
				seen[key] = true
				allStorages = append(allStorages, storage)
			}
		}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"storage": allStorages,
		"count":   len(allStorages),
	})
}

// =============================================================================
// Task Routes
// =============================================================================

// getTask handles GET /api/v1/tasks/{upid}
func (s *Server) getTask(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	upid := vars["upid"]
	node := r.URL.Query().Get("node")

	if node == "" {
		// Try to extract node from UPID
		// UPID format: UPID:node:pid:pstart:starttime:type:id:user@realm:
		node, _ = s.proxmox.GetDefaultNode(ctx)
	}

	task, err := s.proxmox.GetTask(ctx, node, upid)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, task)
}
