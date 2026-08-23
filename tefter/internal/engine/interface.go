package engine

import (
	"context"

	"github.com/oblak/tefter/internal/models"
)

// Provisioner is everything Tefter needs from the layer that actually runs
// databases.
//
// Defined as an interface, like Izvor's ProxmoxClient and Brod's
// ContainerEngine, so the API can be tested without a container runtime.
// DockerProvisioner is the real implementation; MockProvisioner is the
// in-memory one the tests use.
type Provisioner interface {
	// Health and connectivity
	HealthCheck(ctx context.Context) error
	Version(ctx context.Context) (string, error)

	// Instance lifecycle
	ListInstances(ctx context.Context) ([]models.DBInstance, error)
	GetInstance(ctx context.Context, name string) (*models.DBInstance, error)
	CreateInstance(ctx context.Context, req *models.CreateInstanceRequest, password string) (*models.DBInstance, error)
	DeleteInstance(ctx context.Context, name string) error
	StartInstance(ctx context.Context, name string) error
	StopInstance(ctx context.Context, name string) error

	// Replication. CreateReplica provisions a follower and seeds it from the
	// primary; the engine-specific mechanics differ sharply between Postgres
	// and MySQL and live in the implementation.
	CreateReplica(ctx context.Context, req *models.CreateReplicaRequest, primary *models.DBInstance) (*models.DBInstance, error)
	ReplicationStatus(ctx context.Context, replica *models.DBInstance) (*models.ReplicationStatus, error)
	// PromoteReplica turns a follower into a standalone primary. One-way.
	PromoteReplica(ctx context.Context, replica *models.DBInstance) error

	// Stats reads an instance's internal counters (connections, size,
	// throughput, cache behaviour, and replication lag on a replica) for the
	// observability collector. A running-but-unresponsive instance is reported
	// with Up=false rather than as an error, so one sick database does not stop
	// the others from being collected.
	Stats(ctx context.Context, instance *models.DBInstance) (*models.InstanceStats, error)

	// Backups
	CreateBackup(ctx context.Context, instance *models.DBInstance, req *models.CreateBackupRequest) (*models.Backup, error)
	ListBackups(ctx context.Context, instanceName string) ([]models.Backup, error)
	GetBackup(ctx context.Context, id string) (*models.Backup, error)
	DeleteBackup(ctx context.Context, id string) error
	RestoreBackup(ctx context.Context, backup *models.Backup, target *models.DBInstance) error

	// Close releases the underlying connection.
	Close() error
}

// Ensure the concrete implementations satisfy the interface.
var (
	_ Provisioner = (*DockerProvisioner)(nil)
	_ Provisioner = (*MockProvisioner)(nil)
)
