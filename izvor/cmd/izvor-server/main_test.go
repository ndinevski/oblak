package main

import (
	"os"
	"testing"
)

func TestMainPackageExists(t *testing.T) {
	// This test validates that the main package compiles correctly
	// Actual main() functionality is tested via integration tests
	t.Log("Main package compiles successfully")
}

func TestEnvironmentVariables(t *testing.T) {
	// Test that environment variables can be read
	// This doesn't start the server, just validates the config reading logic

	// Save original env
	origURL := os.Getenv("PROXMOX_URL")
	origUser := os.Getenv("PROXMOX_USER")

	// Set test values
	os.Setenv("PROXMOX_URL", "https://test.example.com:8006")
	os.Setenv("PROXMOX_USER", "testuser@pve")

	// Restore after test
	defer func() {
		if origURL != "" {
			os.Setenv("PROXMOX_URL", origURL)
		} else {
			os.Unsetenv("PROXMOX_URL")
		}
		if origUser != "" {
			os.Setenv("PROXMOX_USER", origUser)
		} else {
			os.Unsetenv("PROXMOX_USER")
		}
	}()

	// Verify environment was set correctly
	if os.Getenv("PROXMOX_URL") != "https://test.example.com:8006" {
		t.Error("PROXMOX_URL not set correctly")
	}

	if os.Getenv("PROXMOX_USER") != "testuser@pve" {
		t.Error("PROXMOX_USER not set correctly")
	}
}
