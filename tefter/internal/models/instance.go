package models

import (
	"fmt"
	"regexp"
	"strings"
	"time"
)

// =============================================================================
// Engines
// =============================================================================

// Engine is a supported database engine.
type Engine string

const (
	EnginePostgres Engine = "postgres"
	EngineMySQL    Engine = "mysql"
)

// IsValid reports whether the engine is one Tefter can provision.
func (e Engine) IsValid() bool {
	return e == EnginePostgres || e == EngineMySQL
}

// DefaultPort is the port the engine listens on inside its container.
func (e Engine) DefaultPort() int {
	switch e {
	case EnginePostgres:
		return 5432
	case EngineMySQL:
		return 3306
	}
	return 0
}

// EngineVersion is a version of an engine that Tefter can provision.
type EngineVersion struct {
	Engine  Engine `json:"engine"`
	Version string `json:"version"`
	Image   string `json:"image"`
	Default bool   `json:"default,omitempty"`
}

// SupportedVersions is the catalogue Tefter provisions from.
//
// An explicit allowlist rather than free-form image references: the
// replication setup below is version-sensitive, and letting a caller name any
// image would mean silently provisioning something Tefter cannot replicate or
// back up.
var SupportedVersions = []EngineVersion{
	{Engine: EnginePostgres, Version: "16", Image: "postgres:16-alpine", Default: true},
	{Engine: EnginePostgres, Version: "15", Image: "postgres:15-alpine"},
	{Engine: EnginePostgres, Version: "14", Image: "postgres:14-alpine"},
	{Engine: EngineMySQL, Version: "8.4", Image: "mysql:8.4", Default: true},
	{Engine: EngineMySQL, Version: "8.0", Image: "mysql:8.0"},
}

// ResolveVersion returns the catalogue entry for an engine and version.
// An empty version selects the engine's default.
func ResolveVersion(engine Engine, version string) (*EngineVersion, error) {
	if !engine.IsValid() {
		return nil, &ValidationError{Field: "engine", Message: fmt.Sprintf("unsupported engine: %s", engine)}
	}

	var fallback *EngineVersion
	for i := range SupportedVersions {
		v := &SupportedVersions[i]
		if v.Engine != engine {
			continue
		}
		if v.Default {
			fallback = v
		}
		if version != "" && v.Version == version {
			return v, nil
		}
	}

	if version == "" && fallback != nil {
		return fallback, nil
	}
	return nil, &ValidationError{
		Field:   "version",
		Message: fmt.Sprintf("unsupported %s version: %s", engine, version),
	}
}

// =============================================================================
// Instance sizes
// =============================================================================

// InstanceSize is a predefined resource allocation, the equivalent of an RDS
// instance class.
type InstanceSize struct {
	Name        string  `json:"name"`
	CPULimit    float64 `json:"cpu_limit"` // in cores
	MemoryMB    int     `json:"memory_mb"` //
	Description string  `json:"description,omitempty"`
}

// PredefinedSizes contains the available instance sizes. The names mirror
// Izvor's so the platform reads consistently.
var PredefinedSizes = []InstanceSize{
	{Name: "micro", CPULimit: 0.5, MemoryMB: 512, Description: "Micro: 0.5 vCPU, 512MB RAM"},
	{Name: "small", CPULimit: 1, MemoryMB: 1024, Description: "Small: 1 vCPU, 1GB RAM"},
	{Name: "medium", CPULimit: 2, MemoryMB: 2048, Description: "Medium: 2 vCPUs, 2GB RAM"},
	{Name: "large", CPULimit: 4, MemoryMB: 4096, Description: "Large: 4 vCPUs, 4GB RAM"},
}

// GetSizeByName returns an InstanceSize by name, or nil.
func GetSizeByName(name string) *InstanceSize {
	for i := range PredefinedSizes {
		if PredefinedSizes[i].Name == name {
			return &PredefinedSizes[i]
		}
	}
	return nil
}

// =============================================================================
// Instances
// =============================================================================

// InstanceStatus is the lifecycle state of a database instance.
type InstanceStatus string

const (
	InstanceStatusCreating  InstanceStatus = "creating"
	InstanceStatusAvailable InstanceStatus = "available"
	InstanceStatusStopped   InstanceStatus = "stopped"
	InstanceStatusStarting  InstanceStatus = "starting"
	InstanceStatusBackingUp InstanceStatus = "backing-up"
	InstanceStatusRestoring InstanceStatus = "restoring"
	InstanceStatusFailed    InstanceStatus = "failed"
	InstanceStatusUnknown   InstanceStatus = "unknown"
)

// InstanceRole distinguishes a writable primary from a read-only replica.
type InstanceRole string

const (
	RolePrimary InstanceRole = "primary"
	RoleReplica InstanceRole = "replica"
)

// DBInstance is a managed database, the equivalent of an RDS DB instance.
type DBInstance struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// UID is a stable identity assigned when the instance is created and kept
	// across container recreation (for example on promotion). Unlike the name,
	// which can be reused after an instance is deleted, the UID is unique to
	// one instance for all time. Backups record it so a backup of a since
	// deleted instance is never silently attached to a new instance that
	// happens to reuse the name.
	UID    string       `json:"uid,omitempty"`
	Engine Engine       `json:"engine"`
	Role   InstanceRole `json:"role"`

	Version string `json:"version"`
	Image   string `json:"image,omitempty"`
	Size    string `json:"size"`

	Status       InstanceStatus `json:"status"`
	StatusDetail string         `json:"status_detail,omitempty"`

	// Connection details. Password is only ever returned at creation time;
	// see CreateInstanceResponse.
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Database string `json:"database"`
	Username string `json:"username"`

	// SourceInstance names the primary a replica follows. Empty on a primary.
	SourceInstance string `json:"source_instance,omitempty"`
	// Replicas lists the names of replicas following this instance.
	Replicas []string `json:"replicas,omitempty"`

	CPULimit    float64 `json:"cpu_limit,omitempty"`
	MemoryLimit int64   `json:"memory_limit,omitempty"` // bytes

	CreatedAt time.Time  `json:"created_at"`
	StartedAt *time.Time `json:"started_at,omitempty"`
}

// ConnectionString renders a client connection URI for the instance.
//
// The password is never interpolated: it is issued once at creation and the
// caller substitutes it, so a connection string in a log or a UI can never
// carry the credential.
func (i *DBInstance) ConnectionString() string {
	switch i.Engine {
	case EnginePostgres:
		return fmt.Sprintf("postgresql://%s:<password>@%s:%d/%s", i.Username, i.Host, i.Port, i.Database)
	case EngineMySQL:
		return fmt.Sprintf("mysql://%s:<password>@%s:%d/%s", i.Username, i.Host, i.Port, i.Database)
	}
	return ""
}

// IsReplica reports whether this instance follows another.
func (i *DBInstance) IsReplica() bool {
	return i.Role == RoleReplica
}

// =============================================================================
// Replication
// =============================================================================

// ReplicationState is the health of a replica's link to its primary.
type ReplicationState string

const (
	ReplicationStreaming ReplicationState = "streaming"
	ReplicationCatchup   ReplicationState = "catching-up"
	ReplicationStopped   ReplicationState = "stopped"
	ReplicationError     ReplicationState = "error"
	ReplicationUnknown   ReplicationState = "unknown"
)

// ReplicationStatus describes how far behind a replica is.
type ReplicationStatus struct {
	Instance       string           `json:"instance"`
	SourceInstance string           `json:"source_instance"`
	State          ReplicationState `json:"state"`

	// LagSeconds is how far behind the primary the replica is. Nil when the
	// engine cannot report it, which is different from zero.
	LagSeconds *float64 `json:"lag_seconds,omitempty"`
	// LagBytes is the Postgres equivalent, in WAL bytes.
	LagBytes *int64 `json:"lag_bytes,omitempty"`

	// Engine-reported detail, useful when State is error.
	Detail    string    `json:"detail,omitempty"`
	CheckedAt time.Time `json:"checked_at"`
}

// =============================================================================
// Requests
// =============================================================================

// instanceNameRe constrains a name to what is safe as both a container name
// and a database identifier.
var instanceNameRe = regexp.MustCompile(`^[a-z][a-z0-9-]*[a-z0-9]$`)

// identifierRe constrains database and user names. Deliberately stricter than
// either engine allows: these values are interpolated into DDL that cannot be
// parameterised, so anything outside this set is rejected rather than escaped.
var identifierRe = regexp.MustCompile(`^[a-z_][a-z0-9_]*$`)

// CreateInstanceRequest provisions a new primary.
type CreateInstanceRequest struct {
	Name    string `json:"name"`
	Engine  Engine `json:"engine"`
	Version string `json:"version,omitempty"`
	Size    string `json:"size,omitempty"`

	Database string `json:"database,omitempty"`
	Username string `json:"username,omitempty"`
	// Password is generated when omitted, which is the recommended path.
	Password string `json:"password,omitempty"`
}

// Validate checks the request and fills in defaults.
func (r *CreateInstanceRequest) Validate() error {
	r.Name = strings.TrimSpace(strings.ToLower(r.Name))
	if r.Name == "" {
		return &ValidationError{Field: "name", Message: "name is required"}
	}
	if len(r.Name) < 3 || len(r.Name) > 40 {
		return &ValidationError{Field: "name", Message: "name must be between 3 and 40 characters"}
	}
	if !instanceNameRe.MatchString(r.Name) {
		return &ValidationError{
			Field:   "name",
			Message: "name must be lowercase, start with a letter, end with a letter or digit, and contain only letters, digits and '-'",
		}
	}

	if r.Engine == "" {
		return &ValidationError{Field: "engine", Message: "engine is required"}
	}
	if !r.Engine.IsValid() {
		return &ValidationError{
			Field:   "engine",
			Message: fmt.Sprintf("engine must be one of: %s, %s", EnginePostgres, EngineMySQL),
		}
	}
	if _, err := ResolveVersion(r.Engine, r.Version); err != nil {
		return err
	}

	if r.Size == "" {
		r.Size = "small"
	}
	if GetSizeByName(r.Size) == nil {
		return &ValidationError{Field: "size", Message: fmt.Sprintf("unknown size: %s", r.Size)}
	}

	if r.Database == "" {
		// Hyphens are legal in an instance name but not in an unquoted
		// identifier, so the default substitutes them.
		r.Database = strings.ReplaceAll(r.Name, "-", "_")
	}
	if !identifierRe.MatchString(r.Database) {
		return &ValidationError{
			Field:   "database",
			Message: "database must start with a letter or '_' and contain only lowercase letters, digits and '_'",
		}
	}
	if len(r.Database) > 63 {
		return &ValidationError{Field: "database", Message: "database name must be 63 characters or fewer"}
	}

	if r.Username == "" {
		r.Username = "tefter"
	}
	if !identifierRe.MatchString(r.Username) {
		return &ValidationError{
			Field:   "username",
			Message: "username must start with a letter or '_' and contain only lowercase letters, digits and '_'",
		}
	}
	if len(r.Username) > 32 {
		return &ValidationError{Field: "username", Message: "username must be 32 characters or fewer"}
	}
	// These are reserved by the engines and would collide with the superuser
	// the container image creates.
	switch r.Username {
	case "postgres", "root", "mysql", "replicator":
		return &ValidationError{
			Field:   "username",
			Message: fmt.Sprintf("%q is reserved by the engine; choose another username", r.Username),
		}
	}

	if r.Password != "" && len(r.Password) < 8 {
		return &ValidationError{Field: "password", Message: "password must be at least 8 characters"}
	}

	return nil
}

// CreateReplicaRequest provisions a read replica of an existing primary.
type CreateReplicaRequest struct {
	Name string `json:"name"`
	// SourceInstance is the primary to follow.
	SourceInstance string `json:"source_instance"`
	Size           string `json:"size,omitempty"`
}

// Validate checks the request and fills in defaults.
func (r *CreateReplicaRequest) Validate() error {
	r.Name = strings.TrimSpace(strings.ToLower(r.Name))
	if r.Name == "" {
		return &ValidationError{Field: "name", Message: "name is required"}
	}
	if len(r.Name) < 3 || len(r.Name) > 40 {
		return &ValidationError{Field: "name", Message: "name must be between 3 and 40 characters"}
	}
	if !instanceNameRe.MatchString(r.Name) {
		return &ValidationError{
			Field:   "name",
			Message: "name must be lowercase, start with a letter, end with a letter or digit, and contain only letters, digits and '-'",
		}
	}

	r.SourceInstance = strings.TrimSpace(strings.ToLower(r.SourceInstance))
	if r.SourceInstance == "" {
		return &ValidationError{Field: "source_instance", Message: "source_instance is required"}
	}
	if r.SourceInstance == r.Name {
		return &ValidationError{Field: "source_instance", Message: "a replica cannot follow itself"}
	}

	if r.Size == "" {
		r.Size = "small"
	}
	if GetSizeByName(r.Size) == nil {
		return &ValidationError{Field: "size", Message: fmt.Sprintf("unknown size: %s", r.Size)}
	}

	return nil
}

// CreateInstanceResponse carries the generated password.
//
// The password is returned exactly once, at creation. Tefter stores only what
// the engine needs to run and never serves the credential again, so a leaked
// listing cannot hand over database access.
type CreateInstanceResponse struct {
	Instance *DBInstance `json:"instance"`
	Password string      `json:"password"`
	Note     string      `json:"note"`
}
