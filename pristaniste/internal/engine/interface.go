package engine

import (
	"context"

	"github.com/oblak/pristaniste/internal/models"
)

// ContainerEngine is everything Pristaniste needs from a container runtime.
//
// Defined as an interface, like Izvor's ProxmoxClient, so the API layer can be
// tested without a running Docker daemon. DockerClient is the real
// implementation; MockClient is the in-memory one the tests use.
type ContainerEngine interface {
	// Health and connectivity
	HealthCheck(ctx context.Context) error
	Version(ctx context.Context) (string, error)

	// Container lifecycle
	ListContainers(ctx context.Context, all bool) ([]models.Container, error)
	GetContainer(ctx context.Context, idOrName string) (*models.Container, error)
	CreateContainer(ctx context.Context, req *models.CreateContainerRequest) (*models.Container, error)
	RemoveContainer(ctx context.Context, idOrName string, force bool) error

	// Container power operations
	StartContainer(ctx context.Context, idOrName string) error
	StopContainer(ctx context.Context, idOrName string, timeoutSeconds *int) error
	RestartContainer(ctx context.Context, idOrName string, timeoutSeconds *int) error

	// Observation
	ContainerLogs(ctx context.Context, idOrName string, opts models.LogOptions) ([]models.LogEntry, error)
	ContainerStats(ctx context.Context, idOrName string) (*models.ContainerStats, error)

	// Images. Pull is needed because a container cannot start from an image
	// the local engine has never seen.
	PullImage(ctx context.Context, reference string) error

	// Close releases the underlying connection.
	Close() error
}

// ImageRegistry is everything Pristaniste needs from an image registry.
//
// Kept separate from ContainerEngine because they are genuinely different
// backends: the engine is a Docker daemon over a socket, the registry is a
// Distribution HTTP API. Splitting them means either can be swapped or mocked
// on its own.
type ImageRegistry interface {
	// Health and connectivity
	HealthCheck(ctx context.Context) error

	// Repositories
	ListRepositories(ctx context.Context) ([]models.Repository, error)
	GetRepository(ctx context.Context, name string) (*models.Repository, error)

	// Images within a repository
	ListImages(ctx context.Context, repository string) ([]models.Image, error)
	GetImage(ctx context.Context, repository, tag string) (*models.Image, error)

	// DeleteImage removes a tag's underlying manifest. Because the registry
	// deletes by digest, every tag sharing that digest disappears with it.
	DeleteImage(ctx context.Context, repository, tag string) error

	// DeleteRepository removes every image in a repository.
	DeleteRepository(ctx context.Context, name string) error

	// Host returns the registry endpoint clients should push and pull from,
	// e.g. localhost:5000.
	Host() string
}

// Ensure the concrete implementations satisfy their interfaces.
var (
	_ ContainerEngine = (*DockerClient)(nil)
	_ ImageRegistry   = (*RegistryClient)(nil)
)
