package api

import (
	"context"
	"fmt"

	"github.com/oblak/izvor/internal/models"
)

// checkCapacity verifies a create request fits the target node's real
// resources before anything is provisioned. CPU and memory allow overcommit
// (configurable ratios, since vCPUs are time-shared and RAM can be balloon /
// KSM shared); disk is a hard limit against genuinely free storage, because a
// thin pool that fills up takes every VM on it down with it.
//
// It returns a *capacityError (rendered as HTTP 409) when the request would not
// fit, or nil when it fits or the check is disabled. A failure to read cluster
// state is returned as a plain error (rendered 500): better to refuse than to
// provision blind.
func (s *Server) checkCapacity(ctx context.Context, req *models.CreateVMRequest) error {
	if !s.config.CapacityCheck {
		return nil
	}

	// Resolve the target node.
	node := req.Node
	if node == "" {
		def, err := s.proxmox.GetDefaultNode(ctx)
		if err != nil {
			return fmt.Errorf("could not determine target node: %w", err)
		}
		node = def
	}

	nodes, err := s.proxmox.ListNodes(ctx)
	if err != nil {
		return fmt.Errorf("could not read node capacity: %w", err)
	}
	var target *models.Node
	for i := range nodes {
		if nodes[i].Name == node {
			target = &nodes[i]
			break
		}
	}
	if target == nil {
		return fmt.Errorf("could not read node capacity: node %q not found", node)
	}

	// Sum what is already allocated on the node (allocation, not live usage:
	// capacity planning is about what has been promised, not what is in use
	// right now).
	vms, err := s.proxmox.ListVMs(ctx, node)
	if err != nil {
		return fmt.Errorf("could not read existing VMs: %w", err)
	}
	allocCores := 0
	allocMemMB := 0
	for _, vm := range vms {
		allocCores += vm.Cores
		allocMemMB += vm.Memory
	}

	// CPU (overcommit allowed).
	coreBudget := float64(target.Cores) * s.config.CPUOvercommit
	if float64(allocCores+req.Cores) > coreBudget {
		return &capacityError{msg: fmt.Sprintf(
			"insufficient CPU on node %s: requested %d vCPU, %d of %.0f allocatable vCPU already in use (%d physical cores x %.1f overcommit)",
			node, req.Cores, allocCores, coreBudget, target.Cores, s.config.CPUOvercommit)}
	}

	// Memory (overcommit allowed). Node memory is bytes; requests are MB.
	physicalMB := target.Memory / (1024 * 1024)
	memBudget := float64(physicalMB) * s.config.MemOvercommit
	if float64(allocMemMB+req.Memory) > memBudget {
		return &capacityError{msg: fmt.Sprintf(
			"insufficient memory on node %s: requested %d MB, %d of %.0f MB allocatable already in use (%d MB physical x %.1f overcommit)",
			node, req.Memory, allocMemMB, memBudget, physicalMB, s.config.MemOvercommit)}
	}

	// Disk (hard limit against real free storage that can hold VM images).
	storages, err := s.proxmox.ListStorages(ctx, node)
	if err != nil {
		return fmt.Errorf("could not read storage capacity: %w", err)
	}
	var availableBytes int64
	for _, st := range storages {
		if !st.Enabled {
			continue
		}
		if holdsImages(st) {
			availableBytes += st.Available
		}
	}
	reqBytes := int64(req.DiskSize) * 1024 * 1024 * 1024
	if reqBytes > availableBytes {
		return &capacityError{msg: fmt.Sprintf(
			"insufficient disk on node %s: requested %d GB, only %d GB free on image storage",
			node, req.DiskSize, availableBytes/(1024*1024*1024))}
	}

	return nil
}

// holdsImages reports whether a storage can hold VM disks.
func holdsImages(st models.Storage) bool {
	for _, c := range st.Content {
		if c == "images" || c == "rootdir" {
			return true
		}
	}
	return false
}

// capacityError marks a "would not fit" condition so the handler can map it to
// HTTP 409 Conflict rather than a generic 400/500.
type capacityError struct{ msg string }

func (e *capacityError) Error() string { return e.msg }
