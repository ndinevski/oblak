package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/oblak/izvor/internal/models"
	"github.com/oblak/izvor/internal/proxmox"
)

// capacityServer builds a server backed by the simulator with the capacity gate
// enabled and no overcommit, so budgets equal the node's physical resources
// (simulator node: 32 cores, 128 GB RAM, ~1.79 TB image storage).
func capacityServer(t *testing.T) *Server {
	t.Helper()
	cfg := Config{
		Port:          "8082",
		CapacityCheck: true,
		CPUOvercommit: 1.0,
		MemOvercommit: 1.0,
	}
	server, err := NewServer(cfg, proxmox.NewSimulator())
	if err != nil {
		t.Fatalf("NewServer: %v", err)
	}
	return server
}

func postCreate(t *testing.T, server *Server, req models.CreateVMRequest) int {
	t.Helper()
	body, _ := json.Marshal(req)
	r, _ := http.NewRequest("POST", "/api/v1/vms", bytes.NewBuffer(body))
	r.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, r)
	return rr.Code
}

func TestCapacityGate(t *testing.T) {
	cases := []struct {
		name string
		req  models.CreateVMRequest
		want int
	}{
		{
			name: "fits",
			req:  models.CreateVMRequest{Name: "ok-vm", Template: "ubuntu-22.04", Cores: 2, Memory: 2048, DiskSize: 20},
			want: http.StatusCreated,
		},
		{
			name: "too many cores",
			req:  models.CreateVMRequest{Name: "big-cpu", Template: "ubuntu-22.04", Cores: 40, Memory: 2048, DiskSize: 20},
			want: http.StatusConflict,
		},
		{
			name: "too much memory",
			req:  models.CreateVMRequest{Name: "big-mem", Template: "ubuntu-22.04", Cores: 2, Memory: 200000, DiskSize: 20},
			want: http.StatusConflict,
		},
		{
			name: "too much disk",
			req:  models.CreateVMRequest{Name: "big-disk", Template: "ubuntu-22.04", Cores: 2, Memory: 2048, DiskSize: 3000},
			want: http.StatusConflict,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// Fresh server per case so allocations from one do not affect another.
			server := capacityServer(t)
			if got := postCreate(t, server, tc.req); got != tc.want {
				t.Errorf("expected %d, got %d", tc.want, got)
			}
		})
	}
}

// With the gate disabled, an oversized request provisions anyway (the gate is
// the only thing enforcing physical limits).
func TestCapacityGateDisabled(t *testing.T) {
	cfg := Config{Port: "8082", CapacityCheck: false}
	server, err := NewServer(cfg, proxmox.NewSimulator())
	if err != nil {
		t.Fatalf("NewServer: %v", err)
	}
	req := models.CreateVMRequest{Name: "huge", Template: "ubuntu-22.04", Cores: 100, Memory: 500000, DiskSize: 5000}
	if got := postCreate(t, server, req); got != http.StatusCreated {
		t.Errorf("expected 201 with gate off, got %d", got)
	}
}

// Overcommit lets allocated CPU exceed physical cores up to the ratio.
func TestCapacityOvercommit(t *testing.T) {
	cfg := Config{Port: "8082", CapacityCheck: true, CPUOvercommit: 4.0, MemOvercommit: 1.5}
	server, err := NewServer(cfg, proxmox.NewSimulator())
	if err != nil {
		t.Fatalf("NewServer: %v", err)
	}
	// 100 vCPU on a 32-core node is fine at 4x overcommit (budget 128).
	req := models.CreateVMRequest{Name: "overcommit", Template: "ubuntu-22.04", Cores: 100, Memory: 2048, DiskSize: 20}
	if got := postCreate(t, server, req); got != http.StatusCreated {
		t.Errorf("expected 201 within overcommit budget, got %d", got)
	}
}
