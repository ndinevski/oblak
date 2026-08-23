package models

import (
	"fmt"
	"regexp"
	"strings"
	"time"
)

// =============================================================================
// Containers (the ECS-shaped half of Pristaniste)
// =============================================================================

// ContainerStatus is the lifecycle state of a container.
type ContainerStatus string

const (
	ContainerStatusPending    ContainerStatus = "pending"
	ContainerStatusRunning    ContainerStatus = "running"
	ContainerStatusPaused     ContainerStatus = "paused"
	ContainerStatusRestarting ContainerStatus = "restarting"
	ContainerStatusStopped    ContainerStatus = "stopped"
	ContainerStatusExited     ContainerStatus = "exited"
	ContainerStatusFailed     ContainerStatus = "failed"
	ContainerStatusUnknown    ContainerStatus = "unknown"
)

// RestartPolicy controls what happens when a container exits. These mirror
// Docker's own policies rather than inventing a parallel vocabulary.
type RestartPolicy string

const (
	RestartPolicyNo            RestartPolicy = "no"
	RestartPolicyOnFailure     RestartPolicy = "on-failure"
	RestartPolicyAlways        RestartPolicy = "always"
	RestartPolicyUnlessStopped RestartPolicy = "unless-stopped"
)

// IsValid reports whether the policy is one Docker accepts.
func (p RestartPolicy) IsValid() bool {
	switch p {
	case RestartPolicyNo, RestartPolicyOnFailure, RestartPolicyAlways, RestartPolicyUnlessStopped:
		return true
	}
	return false
}

// PortMapping publishes a container port on the host.
type PortMapping struct {
	ContainerPort int    `json:"container_port"`
	HostPort      int    `json:"host_port"`
	Protocol      string `json:"protocol,omitempty"` // tcp (default) or udp
}

// VolumeMount attaches host storage to a container path.
type VolumeMount struct {
	Source   string `json:"source"` // host path or named volume
	Target   string `json:"target"` // path inside the container
	ReadOnly bool   `json:"read_only,omitempty"`
}

// Container is a single running workload, the equivalent of an ECS task.
//
// Pristaniste deliberately models one container rather than a task definition with a
// replica count: this is a self-hosted single-node service, so a "service"
// with one task and no autoscaling is the whole story, and pretending
// otherwise would add an abstraction that never varies.
type Container struct {
	ID    string `json:"id"` // Docker container id (short form)
	Name  string `json:"name"`
	Image string `json:"image"`

	Status ContainerStatus `json:"status"`
	// Docker's own human-readable status, e.g. "Up 3 minutes". Useful detail
	// the normalised Status enum necessarily loses.
	StatusDetail string `json:"status_detail,omitempty"`

	Command []string          `json:"command,omitempty"`
	Env     map[string]string `json:"env,omitempty"`
	Labels  map[string]string `json:"labels,omitempty"`

	Ports   []PortMapping `json:"ports,omitempty"`
	Volumes []VolumeMount `json:"volumes,omitempty"`

	// Resource limits. Zero means unlimited, matching Docker.
	CPULimit    float64 `json:"cpu_limit,omitempty"`    // in cores, e.g. 0.5
	MemoryLimit int64   `json:"memory_limit,omitempty"` // in bytes

	RestartPolicy RestartPolicy `json:"restart_policy,omitempty"`

	// Runtime detail, only meaningful while running.
	ExitCode   *int       `json:"exit_code,omitempty"`
	StartedAt  *time.Time `json:"started_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	FinishedAt *time.Time `json:"finished_at,omitempty"`

	IPAddress string `json:"ip_address,omitempty"`
	Network   string `json:"network,omitempty"`
}

// ContainerStats is a point-in-time resource sample for one container.
type ContainerStats struct {
	ContainerID string    `json:"container_id"`
	SampledAt   time.Time `json:"sampled_at"`

	CPUPercent  float64 `json:"cpu_percent"`
	MemoryUsage int64   `json:"memory_usage"` // bytes
	MemoryLimit int64   `json:"memory_limit"` // bytes
	MemoryPct   float64 `json:"memory_percent"`

	NetworkRxBytes  int64 `json:"network_rx_bytes"`
	NetworkTxBytes  int64 `json:"network_tx_bytes"`
	BlockReadBytes  int64 `json:"block_read_bytes"`
	BlockWriteBytes int64 `json:"block_write_bytes"`
}

// LogEntry is one line of container output.
type LogEntry struct {
	Timestamp time.Time `json:"timestamp"`
	Stream    string    `json:"stream"` // stdout or stderr
	Message   string    `json:"message"`
}

// =============================================================================
// Requests
// =============================================================================

// CreateContainerRequest launches a new container from an image.
type CreateContainerRequest struct {
	Name  string `json:"name"`
	Image string `json:"image"`

	Command []string          `json:"command,omitempty"`
	Env     map[string]string `json:"env,omitempty"`
	Labels  map[string]string `json:"labels,omitempty"`

	Ports   []PortMapping `json:"ports,omitempty"`
	Volumes []VolumeMount `json:"volumes,omitempty"`

	CPULimit    float64 `json:"cpu_limit,omitempty"`
	MemoryLimit int64   `json:"memory_limit,omitempty"`

	RestartPolicy RestartPolicy `json:"restart_policy,omitempty"`

	// Start the container immediately after creating it. Defaults to true;
	// use a pointer so an explicit false is distinguishable from omission.
	Start *bool `json:"start,omitempty"`
}

// containerNameRe matches Docker's own container-name grammar.
var containerNameRe = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_.-]*$`)

// Validate checks the request and fills in defaults.
func (r *CreateContainerRequest) Validate() error {
	r.Name = strings.TrimSpace(r.Name)
	if r.Name == "" {
		return &ValidationError{Field: "name", Message: "name is required"}
	}
	if len(r.Name) < 2 || len(r.Name) > 63 {
		return &ValidationError{Field: "name", Message: "name must be between 2 and 63 characters"}
	}
	if !containerNameRe.MatchString(r.Name) {
		return &ValidationError{
			Field:   "name",
			Message: "name must start with a letter or digit and contain only letters, digits, '_', '.' or '-'",
		}
	}

	r.Image = strings.TrimSpace(r.Image)
	if r.Image == "" {
		return &ValidationError{Field: "image", Message: "image is required"}
	}
	if _, _, err := ParseImageReference(r.Image); err != nil {
		return err
	}

	for i, p := range r.Ports {
		if p.ContainerPort < 1 || p.ContainerPort > 65535 {
			return &ValidationError{
				Field:   fmt.Sprintf("ports[%d].container_port", i),
				Message: "container_port must be between 1 and 65535",
			}
		}
		// Host port 0 asks Docker to pick a free one, which is legitimate.
		if p.HostPort < 0 || p.HostPort > 65535 {
			return &ValidationError{
				Field:   fmt.Sprintf("ports[%d].host_port", i),
				Message: "host_port must be between 0 and 65535",
			}
		}
		proto := strings.ToLower(strings.TrimSpace(p.Protocol))
		if proto == "" {
			proto = "tcp"
		}
		if proto != "tcp" && proto != "udp" {
			return &ValidationError{
				Field:   fmt.Sprintf("ports[%d].protocol", i),
				Message: "protocol must be tcp or udp",
			}
		}
		r.Ports[i].Protocol = proto
	}

	for i, v := range r.Volumes {
		if strings.TrimSpace(v.Source) == "" {
			return &ValidationError{
				Field:   fmt.Sprintf("volumes[%d].source", i),
				Message: "source is required",
			}
		}
		if !strings.HasPrefix(v.Target, "/") {
			return &ValidationError{
				Field:   fmt.Sprintf("volumes[%d].target", i),
				Message: "target must be an absolute path",
			}
		}
	}

	if r.CPULimit < 0 {
		return &ValidationError{Field: "cpu_limit", Message: "cpu_limit cannot be negative"}
	}
	if r.MemoryLimit < 0 {
		return &ValidationError{Field: "memory_limit", Message: "memory_limit cannot be negative"}
	}
	// Docker refuses anything below 6MB, and the resulting error is opaque.
	const minMemoryBytes = 6 * 1024 * 1024
	if r.MemoryLimit > 0 && r.MemoryLimit < minMemoryBytes {
		return &ValidationError{
			Field:   "memory_limit",
			Message: "memory_limit must be at least 6291456 bytes (6MB) when set",
		}
	}

	if r.RestartPolicy == "" {
		r.RestartPolicy = RestartPolicyUnlessStopped
	}
	if !r.RestartPolicy.IsValid() {
		return &ValidationError{
			Field:   "restart_policy",
			Message: "restart_policy must be one of: no, on-failure, always, unless-stopped",
		}
	}

	return nil
}

// ShouldStart reports whether the container should be started on creation.
func (r *CreateContainerRequest) ShouldStart() bool {
	return r.Start == nil || *r.Start
}

// ContainerActionRequest carries options for a lifecycle action.
type ContainerActionRequest struct {
	// Seconds to wait for a graceful stop before killing. Nil uses Docker's
	// own default.
	TimeoutSeconds *int `json:"timeout_seconds,omitempty"`
	Force          bool `json:"force,omitempty"`
}

// Validate checks the action options.
func (r *ContainerActionRequest) Validate() error {
	if r.TimeoutSeconds != nil && (*r.TimeoutSeconds < 0 || *r.TimeoutSeconds > 3600) {
		return &ValidationError{
			Field:   "timeout_seconds",
			Message: "timeout_seconds must be between 0 and 3600",
		}
	}
	return nil
}

// LogOptions narrows a log request.
type LogOptions struct {
	// Tail is the number of lines from the end of the log. 0 means the
	// server's default.
	Tail int
	// Since returns only entries after this time, when non-zero.
	Since time.Time
	// Timestamps asks the engine to prefix each line with its timestamp.
	Timestamps bool
}

// NormaliseStatus maps a Docker state string onto a ContainerStatus.
//
// Docker reports a small open vocabulary here, and anything unrecognised is
// reported as unknown rather than guessed at, so an unexpected state is
// visible instead of being silently rendered as healthy.
func NormaliseStatus(state string) ContainerStatus {
	switch strings.ToLower(strings.TrimSpace(state)) {
	case "created":
		return ContainerStatusPending
	case "running":
		return ContainerStatusRunning
	case "paused":
		return ContainerStatusPaused
	case "restarting":
		return ContainerStatusRestarting
	case "removing", "exited":
		return ContainerStatusExited
	case "dead":
		return ContainerStatusFailed
	default:
		return ContainerStatusUnknown
	}
}
