package engine

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/oblak/tefter/internal/models"
)

// MockProvisioner is an in-memory Provisioner for tests.
//
// Tefter's real backend runs database containers, which CI does not have and
// which tests should not create. This mirrors Izvor's MockClient and Brod's
// MockEngine so the API layer can be exercised end to end without one.
type MockProvisioner struct {
	mu sync.RWMutex

	instances map[string]*models.DBInstance
	backups   map[string]*models.Backup
	// replication is the state each replica reports, so a test can simulate a
	// healthy stream, a lagging one, or a broken link.
	replication map[string]*models.ReplicationStatus

	nextPort int
	// uidSeq only ever increases, so an instance created after another of the
	// same name was deleted gets a distinct identity, as it does in reality.
	uidSeq int

	// ShouldFail makes every call return FailMessage.
	ShouldFail  bool
	FailMessage string

	// BackupShouldFail fails only backup creation.
	BackupShouldFail bool
	// RestoreShouldFail fails only restores.
	RestoreShouldFail bool
}

// NewMockProvisioner creates an empty mock.
func NewMockProvisioner() *MockProvisioner {
	return &MockProvisioner{
		instances:   make(map[string]*models.DBInstance),
		backups:     make(map[string]*models.Backup),
		replication: make(map[string]*models.ReplicationStatus),
		nextPort:    15000,
		FailMessage: "mock provisioner failure",
	}
}

func (m *MockProvisioner) fail() error {
	if m.ShouldFail {
		return errors.New(m.FailMessage)
	}
	return nil
}

func (m *MockProvisioner) HealthCheck(ctx context.Context) error { return m.fail() }

func (m *MockProvisioner) Version(ctx context.Context) (string, error) {
	if err := m.fail(); err != nil {
		return "", err
	}
	return "mock-1.0", nil
}

func (m *MockProvisioner) Close() error { return nil }

// =============================================================================
// Instances
// =============================================================================

func (m *MockProvisioner) ListInstances(ctx context.Context) ([]models.DBInstance, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()

	out := make([]models.DBInstance, 0, len(m.instances))
	for _, inst := range m.instances {
		copied := *inst
		copied.Replicas = m.replicasOf(inst.Name)
		out = append(out, copied)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

// replicasOf lists the followers of an instance. Caller holds the lock.
func (m *MockProvisioner) replicasOf(name string) []string {
	var out []string
	for _, other := range m.instances {
		if other.SourceInstance == name {
			out = append(out, other.Name)
		}
	}
	sort.Strings(out)
	return out
}

func (m *MockProvisioner) GetInstance(ctx context.Context, name string) (*models.DBInstance, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()

	inst, ok := m.instances[name]
	if !ok {
		return nil, fmt.Errorf("%w: instance %s", models.ErrNotFound, name)
	}
	copied := *inst
	copied.Replicas = m.replicasOf(name)
	return &copied, nil
}

func (m *MockProvisioner) CreateInstance(ctx context.Context, req *models.CreateInstanceRequest, password string) (*models.DBInstance, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.instances[req.Name]; exists {
		return nil, fmt.Errorf("%w: instance %s", models.ErrAlreadyExists, req.Name)
	}

	version, err := models.ResolveVersion(req.Engine, req.Version)
	if err != nil {
		return nil, err
	}
	size := models.GetSizeByName(req.Size)
	if size == nil {
		return nil, &models.ValidationError{Field: "size", Message: "unknown size"}
	}

	now := time.Now().UTC()
	inst := &models.DBInstance{
		ID:          fmt.Sprintf("mock%08d", len(m.instances)+1),
		Name:        req.Name,
		UID:         fmt.Sprintf("uid-%s-%d", req.Name, m.uidSeq),
		Engine:      req.Engine,
		Role:        models.RolePrimary,
		Version:     version.Version,
		Image:       version.Image,
		Size:        req.Size,
		Status:      models.InstanceStatusAvailable,
		Host:        "localhost",
		Port:        m.nextPort,
		Database:    req.Database,
		Username:    req.Username,
		CPULimit:    size.CPULimit,
		MemoryLimit: int64(size.MemoryMB) * 1024 * 1024,
		CreatedAt:   now,
		StartedAt:   &now,
	}
	m.nextPort++
	m.uidSeq++
	m.instances[req.Name] = inst

	copied := *inst
	return &copied, nil
}

func (m *MockProvisioner) DeleteInstance(ctx context.Context, name string) error {
	if err := m.fail(); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()

	inst, ok := m.instances[name]
	if !ok {
		return fmt.Errorf("%w: instance %s", models.ErrNotFound, name)
	}
	// Deleting a primary out from under its replicas would orphan them.
	if replicas := m.replicasOf(inst.Name); len(replicas) > 0 {
		return fmt.Errorf("%w: %s still has replicas", models.ErrHasReplicas, name)
	}

	delete(m.instances, name)
	delete(m.replication, name)
	return nil
}

func (m *MockProvisioner) StartInstance(ctx context.Context, name string) error {
	if err := m.fail(); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()

	inst, ok := m.instances[name]
	if !ok {
		return fmt.Errorf("%w: instance %s", models.ErrNotFound, name)
	}
	now := time.Now().UTC()
	inst.Status = models.InstanceStatusAvailable
	inst.StartedAt = &now
	return nil
}

func (m *MockProvisioner) StopInstance(ctx context.Context, name string) error {
	if err := m.fail(); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()

	inst, ok := m.instances[name]
	if !ok {
		return fmt.Errorf("%w: instance %s", models.ErrNotFound, name)
	}
	inst.Status = models.InstanceStatusStopped
	return nil
}

// =============================================================================
// Replication
// =============================================================================

func (m *MockProvisioner) CreateReplica(ctx context.Context, req *models.CreateReplicaRequest, primary *models.DBInstance) (*models.DBInstance, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.instances[req.Name]; exists {
		return nil, fmt.Errorf("%w: instance %s", models.ErrAlreadyExists, req.Name)
	}
	if primary.IsReplica() {
		return nil, &models.ValidationError{
			Field:   "source_instance",
			Message: fmt.Sprintf("%s is itself a replica; replicas of replicas are not supported", primary.Name),
		}
	}
	if primary.Status != models.InstanceStatusAvailable {
		return nil, fmt.Errorf("%w: %s must be available to replicate from", models.ErrInstanceNotReady, primary.Name)
	}

	size := models.GetSizeByName(req.Size)
	if size == nil {
		return nil, &models.ValidationError{Field: "size", Message: "unknown size"}
	}

	now := time.Now().UTC()
	replica := &models.DBInstance{
		ID:             fmt.Sprintf("mock%08d", len(m.instances)+1),
		Name:           req.Name,
		UID:            fmt.Sprintf("uid-%s-%d", req.Name, m.uidSeq),
		Engine:         primary.Engine,
		Role:           models.RoleReplica,
		Version:        primary.Version,
		Image:          primary.Image,
		Size:           req.Size,
		Status:         models.InstanceStatusAvailable,
		Host:           "localhost",
		Port:           m.nextPort,
		Database:       primary.Database,
		Username:       primary.Username,
		SourceInstance: primary.Name,
		CPULimit:       size.CPULimit,
		MemoryLimit:    int64(size.MemoryMB) * 1024 * 1024,
		CreatedAt:      now,
		StartedAt:      &now,
	}
	m.nextPort++
	m.uidSeq++
	m.instances[req.Name] = replica

	// A freshly seeded replica starts caught up.
	m.replication[req.Name] = &models.ReplicationStatus{
		Instance:       req.Name,
		SourceInstance: primary.Name,
		State:          models.ReplicationStreaming,
		LagSeconds:     float64Ptr(0),
		CheckedAt:      now,
	}

	copied := *replica
	return &copied, nil
}

func (m *MockProvisioner) ReplicationStatus(ctx context.Context, replica *models.DBInstance) (*models.ReplicationStatus, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	if !replica.IsReplica() {
		return nil, &models.ValidationError{
			Field:   "instance",
			Message: fmt.Sprintf("%s is a primary, not a replica", replica.Name),
		}
	}

	m.mu.RLock()
	defer m.mu.RUnlock()

	if status, ok := m.replication[replica.Name]; ok {
		copied := *status
		copied.CheckedAt = time.Now().UTC()
		return &copied, nil
	}
	return &models.ReplicationStatus{
		Instance:       replica.Name,
		SourceInstance: replica.SourceInstance,
		State:          models.ReplicationUnknown,
		CheckedAt:      time.Now().UTC(),
	}, nil
}

// Stats returns deterministic canned stats so the collector can be tested
// without a real database.
func (m *MockProvisioner) Stats(ctx context.Context, inst *models.DBInstance) (*models.InstanceStats, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	stats := &models.InstanceStats{
		Instance:       inst.Name,
		Engine:         inst.Engine,
		Role:           inst.Role,
		Up:             inst.Status == models.InstanceStatusAvailable,
		Connections:    5,
		MaxConnections: 100,
		SizeBytes:      1024 * 1024,
		CommitsTotal:   1000,
		RollbacksTotal: 3,
		BlocksHit:      9500,
		BlocksRead:     500,
		CollectedAt:    time.Now().UTC(),
	}
	if inst.IsReplica() {
		lag := 0.5
		stats.ReplicationLagSeconds = &lag
	}
	slow := int64(1)
	slowest := 42.0
	stats.SlowQueries = &slow
	stats.SlowestQueryMeanMs = &slowest
	return stats, nil
}

func (m *MockProvisioner) PromoteReplica(ctx context.Context, replica *models.DBInstance) error {
	if err := m.fail(); err != nil {
		return err
	}
	if !replica.IsReplica() {
		return &models.ValidationError{
			Field:   "instance",
			Message: fmt.Sprintf("%s is already a primary", replica.Name),
		}
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	inst, ok := m.instances[replica.Name]
	if !ok {
		return fmt.Errorf("%w: instance %s", models.ErrNotFound, replica.Name)
	}
	// Promotion is one-way: the instance stops following and becomes writable.
	inst.Role = models.RolePrimary
	inst.SourceInstance = ""
	delete(m.replication, replica.Name)
	return nil
}

// =============================================================================
// Backups
// =============================================================================

func (m *MockProvisioner) CreateBackup(ctx context.Context, inst *models.DBInstance, req *models.CreateBackupRequest) (*models.Backup, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	if inst.Status != models.InstanceStatusAvailable {
		return nil, fmt.Errorf("%w: %s must be available to back up", models.ErrInstanceNotReady, inst.Name)
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	started := time.Now().UTC()
	backup := &models.Backup{
		// A counter keeps ids unique: several backups of one instance inside
		// the same second would otherwise collide on the timestamp.
		ID:          fmt.Sprintf("%s-%d", models.NewBackupID(inst.Name, started), len(m.backups)+1),
		Instance:    inst.Name,
		InstanceUID: inst.UID,
		Engine:      inst.Engine,
		Database:    inst.Database,
		Type:        req.Type,
		Description: req.Description,
		StartedAt:   started,
	}

	if m.BackupShouldFail {
		backup.Status = models.BackupStatusFailed
		backup.Error = "mock backup failure"
		m.backups[backup.ID] = backup
		copied := *backup
		return &copied, fmt.Errorf("backup failed: mock backup failure")
	}

	completed := started.Add(time.Second)
	backup.Status = models.BackupStatusAvailable
	backup.SizeBytes = 4096
	backup.Path = "/var/lib/tefter/backups/" + backup.ID + ".sql"
	backup.CompletedAt = &completed
	backup.DurationSeconds = 1

	m.backups[backup.ID] = backup
	copied := *backup
	return &copied, nil
}

func (m *MockProvisioner) ListBackups(ctx context.Context, instanceName string) ([]models.Backup, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()

	// Mirror the real provisioner's identity-aware filtering: a per-instance
	// listing returns only the current instance's backups, and every backup is
	// flagged when its instance no longer exists.
	liveUIDs := map[string]bool{}
	liveNames := map[string]bool{}
	for _, inst := range m.instances {
		if inst.UID != "" {
			liveUIDs[inst.UID] = true
		}
		liveNames[inst.Name] = true
	}
	var wantUID string
	var haveInstance bool
	if instanceName != "" {
		if inst, ok := m.instances[instanceName]; ok {
			haveInstance = true
			wantUID = inst.UID
		}
	}

	out := make([]models.Backup, 0, len(m.backups))
	for _, b := range m.backups {
		if instanceName != "" {
			if b.Instance != instanceName {
				continue
			}
			if haveInstance && wantUID != "" && b.InstanceUID != "" && b.InstanceUID != wantUID {
				continue
			}
		}
		copied := *b
		if b.InstanceUID != "" {
			copied.FromDeletedInstance = !liveUIDs[b.InstanceUID]
		} else {
			copied.FromDeletedInstance = !liveNames[b.Instance]
		}
		out = append(out, copied)
	}
	// Newest first, matching the real provisioner.
	sort.Slice(out, func(i, j int) bool { return out[i].StartedAt.After(out[j].StartedAt) })
	return out, nil
}

func (m *MockProvisioner) GetBackup(ctx context.Context, id string) (*models.Backup, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()

	b, ok := m.backups[id]
	if !ok {
		return nil, fmt.Errorf("%w: backup %s", models.ErrNotFound, id)
	}
	copied := *b
	return &copied, nil
}

func (m *MockProvisioner) DeleteBackup(ctx context.Context, id string) error {
	if err := m.fail(); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.backups[id]; !ok {
		return fmt.Errorf("%w: backup %s", models.ErrNotFound, id)
	}
	delete(m.backups, id)
	return nil
}

func (m *MockProvisioner) RestoreBackup(ctx context.Context, backup *models.Backup, target *models.DBInstance) error {
	if err := m.fail(); err != nil {
		return err
	}
	if m.RestoreShouldFail {
		return fmt.Errorf("restore failed: mock restore failure")
	}
	if target.Status != models.InstanceStatusAvailable {
		return fmt.Errorf("%w: %s must be available to restore into", models.ErrInstanceNotReady, target.Name)
	}
	if target.IsReplica() {
		return &models.ValidationError{
			Field:   "target_instance",
			Message: fmt.Sprintf("%s is a read replica and cannot be restored into", target.Name),
		}
	}
	if backup.Engine != target.Engine {
		return &models.ValidationError{
			Field: "target_instance",
			Message: fmt.Sprintf("backup is a %s dump but %s is %s",
				backup.Engine, target.Name, target.Engine),
		}
	}
	return nil
}

// =============================================================================
// Test seams
// =============================================================================

// SetReplicationStatus overrides what a replica reports, so a test can
// simulate lag or a broken link.
func (m *MockProvisioner) SetReplicationStatus(replica string, status *models.ReplicationStatus) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.replication[replica] = status
}

// SetInstanceStatus overrides an instance's lifecycle state.
func (m *MockProvisioner) SetInstanceStatus(name string, status models.InstanceStatus) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if inst, ok := m.instances[name]; ok {
		inst.Status = status
	}
}

func float64Ptr(f float64) *float64 { return &f }
