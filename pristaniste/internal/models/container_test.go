package models

import "testing"

func boolPtr(b bool) *bool { return &b }
func intPtr(i int) *int    { return &i }

func validCreateRequest() CreateContainerRequest {
	return CreateContainerRequest{Name: "web", Image: "nginx:alpine"}
}

func TestCreateContainerRequestValidate(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(*CreateContainerRequest)
		wantErr bool
		field   string
	}{
		{"minimal valid", func(r *CreateContainerRequest) {}, false, ""},

		{"empty name", func(r *CreateContainerRequest) { r.Name = "" }, true, "name"},
		{"one-character name", func(r *CreateContainerRequest) { r.Name = "a" }, true, "name"},
		{"name starting with a dash", func(r *CreateContainerRequest) { r.Name = "-web" }, true, "name"},
		{"name with a slash", func(r *CreateContainerRequest) { r.Name = "my/web" }, true, "name"},
		{"name with a space", func(r *CreateContainerRequest) { r.Name = "my web" }, true, "name"},
		{"uppercase name is allowed", func(r *CreateContainerRequest) { r.Name = "Web" }, false, ""},

		{"empty image", func(r *CreateContainerRequest) { r.Image = "" }, true, "image"},
		{"malformed image", func(r *CreateContainerRequest) { r.Image = "nginx:" }, true, "image"},

		{"port zero", func(r *CreateContainerRequest) {
			r.Ports = []PortMapping{{ContainerPort: 0, HostPort: 8080}}
		}, true, "ports[0].container_port"},
		{"port too high", func(r *CreateContainerRequest) {
			r.Ports = []PortMapping{{ContainerPort: 70000, HostPort: 8080}}
		}, true, "ports[0].container_port"},
		{"negative host port", func(r *CreateContainerRequest) {
			r.Ports = []PortMapping{{ContainerPort: 80, HostPort: -1}}
		}, true, "ports[0].host_port"},
		{"host port zero is allowed", func(r *CreateContainerRequest) {
			// 0 asks Docker to allocate a free port, which is legitimate.
			r.Ports = []PortMapping{{ContainerPort: 80, HostPort: 0}}
		}, false, ""},
		{"bad protocol", func(r *CreateContainerRequest) {
			r.Ports = []PortMapping{{ContainerPort: 80, HostPort: 8080, Protocol: "sctp"}}
		}, true, "ports[0].protocol"},

		{"volume without source", func(r *CreateContainerRequest) {
			r.Volumes = []VolumeMount{{Source: "", Target: "/data"}}
		}, true, "volumes[0].source"},
		{"relative volume target", func(r *CreateContainerRequest) {
			r.Volumes = []VolumeMount{{Source: "/host", Target: "data"}}
		}, true, "volumes[0].target"},

		{"negative cpu", func(r *CreateContainerRequest) { r.CPULimit = -1 }, true, "cpu_limit"},
		{"negative memory", func(r *CreateContainerRequest) { r.MemoryLimit = -1 }, true, "memory_limit"},
		{"memory below the docker minimum", func(r *CreateContainerRequest) {
			r.MemoryLimit = 1024
		}, true, "memory_limit"},
		{"memory at the docker minimum", func(r *CreateContainerRequest) {
			r.MemoryLimit = 6 * 1024 * 1024
		}, false, ""},

		{"invalid restart policy", func(r *CreateContainerRequest) {
			r.RestartPolicy = "sometimes"
		}, true, "restart_policy"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := validCreateRequest()
			tt.mutate(&req)
			err := req.Validate()

			if tt.wantErr {
				if err == nil {
					t.Fatal("expected an error, got none")
				}
				ve, ok := err.(*ValidationError)
				if !ok {
					t.Fatalf("expected a ValidationError, got %T", err)
				}
				if ve.Field != tt.field {
					t.Errorf("expected field %q, got %q", tt.field, ve.Field)
				}
				return
			}

			if err != nil {
				t.Fatalf("expected no error, got %v", err)
			}
		})
	}
}

func TestCreateContainerRequestDefaults(t *testing.T) {
	req := validCreateRequest()
	if err := req.Validate(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// unless-stopped is the sane default for a long-running workload: it
	// survives a daemon restart but respects a deliberate stop.
	if req.RestartPolicy != RestartPolicyUnlessStopped {
		t.Errorf("expected the default restart policy to be unless-stopped, got %q", req.RestartPolicy)
	}
}

func TestCreateContainerRequestDefaultsPortProtocol(t *testing.T) {
	req := validCreateRequest()
	req.Ports = []PortMapping{{ContainerPort: 80, HostPort: 8080}}

	if err := req.Validate(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if req.Ports[0].Protocol != "tcp" {
		t.Errorf("expected the protocol to default to tcp, got %q", req.Ports[0].Protocol)
	}
}

func TestCreateContainerRequestNormalisesProtocolCase(t *testing.T) {
	req := validCreateRequest()
	req.Ports = []PortMapping{{ContainerPort: 53, HostPort: 5353, Protocol: "UDP"}}

	if err := req.Validate(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if req.Ports[0].Protocol != "udp" {
		t.Errorf("expected the protocol to be lowercased, got %q", req.Ports[0].Protocol)
	}
}

func TestCreateContainerRequestTrimsName(t *testing.T) {
	req := CreateContainerRequest{Name: "  web  ", Image: "nginx"}
	if err := req.Validate(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if req.Name != "web" {
		t.Errorf("expected the name to be trimmed, got %q", req.Name)
	}
}

func TestShouldStart(t *testing.T) {
	// Omitted means start, which is what someone launching a workload expects.
	req := validCreateRequest()
	if !req.ShouldStart() {
		t.Error("expected an unset Start to mean start")
	}

	req.Start = boolPtr(true)
	if !req.ShouldStart() {
		t.Error("expected Start=true to mean start")
	}

	// A pointer is used precisely so an explicit false is distinguishable
	// from omission.
	req.Start = boolPtr(false)
	if req.ShouldStart() {
		t.Error("expected Start=false to mean do not start")
	}
}

func TestContainerActionRequestValidate(t *testing.T) {
	tests := []struct {
		name    string
		timeout *int
		wantErr bool
	}{
		{"no timeout", nil, false},
		{"zero timeout", intPtr(0), false},
		{"normal timeout", intPtr(30), false},
		{"max timeout", intPtr(3600), false},
		{"negative timeout", intPtr(-1), true},
		{"beyond max", intPtr(3601), true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := ContainerActionRequest{TimeoutSeconds: tt.timeout}
			err := req.Validate()

			if tt.wantErr && err == nil {
				t.Error("expected an error, got none")
			}
			if !tt.wantErr && err != nil {
				t.Errorf("expected no error, got %v", err)
			}
		})
	}
}

func TestRestartPolicyIsValid(t *testing.T) {
	for _, p := range []RestartPolicy{
		RestartPolicyNo, RestartPolicyOnFailure, RestartPolicyAlways, RestartPolicyUnlessStopped,
	} {
		if !p.IsValid() {
			t.Errorf("expected %q to be valid", p)
		}
	}

	for _, p := range []RestartPolicy{"", "sometimes", "ALWAYS"} {
		if p.IsValid() {
			t.Errorf("expected %q to be invalid", p)
		}
	}
}

func TestNormaliseStatus(t *testing.T) {
	tests := map[string]ContainerStatus{
		"created":    ContainerStatusPending,
		"running":    ContainerStatusRunning,
		"paused":     ContainerStatusPaused,
		"restarting": ContainerStatusRestarting,
		"exited":     ContainerStatusExited,
		"removing":   ContainerStatusExited,
		"dead":       ContainerStatusFailed,
		"RUNNING":    ContainerStatusRunning,
		"  running ": ContainerStatusRunning,
	}

	for input, want := range tests {
		if got := NormaliseStatus(input); got != want {
			t.Errorf("NormaliseStatus(%q): expected %q, got %q", input, want, got)
		}
	}

	// An unrecognised state must surface as unknown rather than being guessed
	// at, so a new Docker state is visible instead of looking healthy.
	if got := NormaliseStatus("some-future-state"); got != ContainerStatusUnknown {
		t.Errorf("expected an unrecognised state to be unknown, got %q", got)
	}
	if got := NormaliseStatus(""); got != ContainerStatusUnknown {
		t.Errorf("expected an empty state to be unknown, got %q", got)
	}
}
