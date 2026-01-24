package proxmox

import (
	"testing"

	"github.com/oblak/izvor/internal/models"
)

func TestParseVMStatus(t *testing.T) {
	tests := []struct {
		input    string
		expected models.VMStatus
	}{
		{"running", models.VMStatusRunning},
		{"stopped", models.VMStatusStopped},
		{"paused", models.VMStatusPaused},
		{"unknown", models.VMStatusUnknown},
		{"", models.VMStatusUnknown},
		{"invalid", models.VMStatusUnknown},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := parseVMStatus(tt.input)
			if result != tt.expected {
				t.Errorf("parseVMStatus(%q) = %v, want %v", tt.input, result, tt.expected)
			}
		})
	}
}

func TestParseNetworkConfig(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"virtio=AA:BB:CC:DD:EE:FF,bridge=vmbr0", "vmbr0"},
		{"virtio=AA:BB:CC:DD:EE:FF,bridge=vmbr1,firewall=1", "vmbr1"},
		{"bridge=vmbr2,virtio=AA:BB:CC:DD:EE:FF", "vmbr2"},
		{"virtio=AA:BB:CC:DD:EE:FF", ""},
		{"", ""},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := parseNetworkConfig(tt.input)
			if result != tt.expected {
				t.Errorf("parseNetworkConfig(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

func TestParseIPConfig(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"ip=192.168.1.100/24,gw=192.168.1.1", "192.168.1.100"},
		{"ip=10.0.0.5/16", "10.0.0.5"},
		{"ip=dhcp", "dhcp"},
		{"gw=192.168.1.1", ""},
		{"", ""},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := parseIPConfig(tt.input)
			if result != tt.expected {
				t.Errorf("parseIPConfig(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

func TestConfig(t *testing.T) {
	cfg := Config{
		URL:                "https://pve.example.com:8006",
		User:               "root@pam",
		Password:           "secret",
		TokenID:            "",
		TokenSecret:        "",
		DefaultNode:        "pve",
		InsecureSkipVerify: true,
	}

	if cfg.URL != "https://pve.example.com:8006" {
		t.Errorf("Expected URL to be set correctly")
	}

	if cfg.User != "root@pam" {
		t.Errorf("Expected User to be set correctly")
	}

	if cfg.DefaultNode != "pve" {
		t.Errorf("Expected DefaultNode to be set correctly")
	}

	if !cfg.InsecureSkipVerify {
		t.Errorf("Expected InsecureSkipVerify to be true")
	}
}

func TestConfigWithToken(t *testing.T) {
	cfg := Config{
		URL:         "https://pve.example.com:8006",
		User:        "api@pve",
		TokenID:     "api@pve!mytoken",
		TokenSecret: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
	}

	if cfg.TokenID == "" {
		t.Error("TokenID should be set")
	}

	if cfg.TokenSecret == "" {
		t.Error("TokenSecret should be set")
	}

	// Password should be empty when using tokens
	if cfg.Password != "" {
		t.Error("Password should be empty when using token auth")
	}
}
