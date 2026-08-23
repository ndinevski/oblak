package engine

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/oblak/pristaniste/internal/models"
)

// MockEngine is an in-memory ContainerEngine for tests.
//
// Pristaniste's real backend is a Docker daemon, which CI does not have and which
// tests should not mutate anyway. This mirrors Izvor's MockClient so the API
// layer can be exercised end to end without one.
type MockEngine struct {
	mu sync.RWMutex

	containers map[string]*models.Container
	logs       map[string][]models.LogEntry
	stats      map[string]*models.ContainerStats
	pulled     []string

	// ShouldFail makes every call return FailMessage, for testing error paths.
	ShouldFail  bool
	FailMessage string

	// PullShouldFail fails only PullImage, which is how a bad image reference
	// behaves in reality.
	PullShouldFail bool
}

// NewMockEngine creates an empty mock engine.
func NewMockEngine() *MockEngine {
	return &MockEngine{
		containers:  make(map[string]*models.Container),
		logs:        make(map[string][]models.LogEntry),
		stats:       make(map[string]*models.ContainerStats),
		FailMessage: "mock engine failure",
	}
}

func (m *MockEngine) fail() error {
	if m.ShouldFail {
		return errors.New(m.FailMessage)
	}
	return nil
}

// resolve finds a container by id or name.
func (m *MockEngine) resolve(idOrName string) (*models.Container, bool) {
	if c, ok := m.containers[idOrName]; ok {
		return c, true
	}
	for _, c := range m.containers {
		if c.Name == idOrName {
			return c, true
		}
	}
	return nil, false
}

func (m *MockEngine) HealthCheck(ctx context.Context) error { return m.fail() }

func (m *MockEngine) Version(ctx context.Context) (string, error) {
	if err := m.fail(); err != nil {
		return "", err
	}
	return "mock-1.0", nil
}

func (m *MockEngine) Close() error { return nil }

func (m *MockEngine) ListContainers(ctx context.Context, all bool) ([]models.Container, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()

	out := make([]models.Container, 0, len(m.containers))
	for _, c := range m.containers {
		if !all && c.Status != models.ContainerStatusRunning {
			continue
		}
		out = append(out, *c)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

func (m *MockEngine) GetContainer(ctx context.Context, idOrName string) (*models.Container, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()

	c, ok := m.resolve(idOrName)
	if !ok {
		return nil, fmt.Errorf("%w: container %s", models.ErrNotFound, idOrName)
	}
	copied := *c
	return &copied, nil
}

func (m *MockEngine) CreateContainer(ctx context.Context, req *models.CreateContainerRequest) (*models.Container, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	if m.PullShouldFail {
		return nil, fmt.Errorf("pull image %s: not found", req.Image)
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.resolve(req.Name); exists {
		return nil, fmt.Errorf("%w: container %s", models.ErrAlreadyExists, req.Name)
	}

	id := fmt.Sprintf("mock%08d", len(m.containers)+1)
	now := time.Now().UTC()

	c := &models.Container{
		ID:            id,
		Name:          req.Name,
		Image:         req.Image,
		Status:        models.ContainerStatusPending,
		Command:       req.Command,
		Env:           req.Env,
		Labels:        map[string]string{ManagedLabel: "true"},
		Ports:         req.Ports,
		Volumes:       req.Volumes,
		CPULimit:      req.CPULimit,
		MemoryLimit:   req.MemoryLimit,
		RestartPolicy: req.RestartPolicy,
		CreatedAt:     now,
	}
	for k, v := range req.Labels {
		if k != ManagedLabel {
			c.Labels[k] = v
		}
	}

	if req.ShouldStart() {
		c.Status = models.ContainerStatusRunning
		c.StatusDetail = "Up 1 second"
		c.StartedAt = &now
	}

	m.containers[id] = c
	m.pulled = append(m.pulled, req.Image)

	copied := *c
	return &copied, nil
}

func (m *MockEngine) RemoveContainer(ctx context.Context, idOrName string, force bool) error {
	if err := m.fail(); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()

	c, ok := m.resolve(idOrName)
	if !ok {
		return fmt.Errorf("%w: container %s", models.ErrNotFound, idOrName)
	}
	if c.Status == models.ContainerStatusRunning && !force {
		return fmt.Errorf("container %s is running; use force", c.Name)
	}
	delete(m.containers, c.ID)
	return nil
}

func (m *MockEngine) StartContainer(ctx context.Context, idOrName string) error {
	if err := m.fail(); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()

	c, ok := m.resolve(idOrName)
	if !ok {
		return fmt.Errorf("%w: container %s", models.ErrNotFound, idOrName)
	}
	now := time.Now().UTC()
	c.Status = models.ContainerStatusRunning
	c.StartedAt = &now
	c.ExitCode = nil
	return nil
}

func (m *MockEngine) StopContainer(ctx context.Context, idOrName string, timeoutSeconds *int) error {
	if err := m.fail(); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()

	c, ok := m.resolve(idOrName)
	if !ok {
		return fmt.Errorf("%w: container %s", models.ErrNotFound, idOrName)
	}
	now := time.Now().UTC()
	code := 0
	c.Status = models.ContainerStatusExited
	c.FinishedAt = &now
	c.ExitCode = &code
	return nil
}

func (m *MockEngine) RestartContainer(ctx context.Context, idOrName string, timeoutSeconds *int) error {
	if err := m.StopContainer(ctx, idOrName, timeoutSeconds); err != nil {
		return err
	}
	return m.StartContainer(ctx, idOrName)
}

func (m *MockEngine) ContainerLogs(ctx context.Context, idOrName string, opts models.LogOptions) ([]models.LogEntry, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()

	c, ok := m.resolve(idOrName)
	if !ok {
		return nil, fmt.Errorf("%w: container %s", models.ErrNotFound, idOrName)
	}

	entries := m.logs[c.ID]
	if opts.Tail > 0 && len(entries) > opts.Tail {
		entries = entries[len(entries)-opts.Tail:]
	}
	return entries, nil
}

func (m *MockEngine) ContainerStats(ctx context.Context, idOrName string) (*models.ContainerStats, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()

	c, ok := m.resolve(idOrName)
	if !ok {
		return nil, fmt.Errorf("%w: container %s", models.ErrNotFound, idOrName)
	}
	if s, ok := m.stats[c.ID]; ok {
		return s, nil
	}
	return &models.ContainerStats{ContainerID: c.ID, SampledAt: time.Now().UTC()}, nil
}

func (m *MockEngine) PullImage(ctx context.Context, reference string) error {
	if err := m.fail(); err != nil {
		return err
	}
	if m.PullShouldFail {
		return fmt.Errorf("pull image %s: not found", reference)
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.pulled = append(m.pulled, reference)
	return nil
}

// SeedLogs attaches log lines to a container, for tests.
func (m *MockEngine) SeedLogs(containerID string, entries ...models.LogEntry) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.logs[containerID] = append(m.logs[containerID], entries...)
}

// SeedStats attaches a stats sample to a container, for tests.
func (m *MockEngine) SeedStats(containerID string, s *models.ContainerStats) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.stats[containerID] = s
}

// PulledImages returns every reference the engine was asked to pull.
func (m *MockEngine) PulledImages() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return append([]string(nil), m.pulled...)
}

// =============================================================================
// MockRegistry
// =============================================================================

// MockRegistry is an in-memory ImageRegistry for tests.
type MockRegistry struct {
	mu sync.RWMutex

	// images is repository -> tag -> image.
	images map[string]map[string]models.Image

	ShouldFail  bool
	FailMessage string
	// DeleteDisabled reproduces a registry started without delete support.
	DeleteDisabled bool

	host string
}

// NewMockRegistry creates an empty mock registry.
func NewMockRegistry() *MockRegistry {
	return &MockRegistry{
		images:      make(map[string]map[string]models.Image),
		FailMessage: "mock registry failure",
		host:        "registry.test:5000",
	}
}

func (m *MockRegistry) fail() error {
	if m.ShouldFail {
		return errors.New(m.FailMessage)
	}
	return nil
}

func (m *MockRegistry) Host() string { return m.host }

func (m *MockRegistry) HealthCheck(ctx context.Context) error { return m.fail() }

func (m *MockRegistry) ListRepositories(ctx context.Context) ([]models.Repository, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()

	out := make([]models.Repository, 0, len(m.images))
	for name, tags := range m.images {
		repo := models.Repository{
			Name:       name,
			URI:        fmt.Sprintf("%s/%s", m.host, name),
			Exists:     true,
			ImageCount: len(tags),
		}
		for _, img := range tags {
			repo.SizeBytes += img.SizeBytes
			if repo.LatestTag == "" {
				repo.LatestTag = img.Tag
			}
		}
		out = append(out, repo)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

func (m *MockRegistry) GetRepository(ctx context.Context, name string) (*models.Repository, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()

	tags, ok := m.images[name]
	if !ok {
		return nil, fmt.Errorf("%w: repository %s", models.ErrNotFound, name)
	}

	repo := &models.Repository{
		Name:       name,
		URI:        fmt.Sprintf("%s/%s", m.host, name),
		Exists:     true,
		ImageCount: len(tags),
	}
	for _, img := range tags {
		repo.SizeBytes += img.SizeBytes
	}
	return repo, nil
}

func (m *MockRegistry) ListImages(ctx context.Context, repository string) ([]models.Image, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()

	tags, ok := m.images[repository]
	if !ok {
		return nil, fmt.Errorf("%w: repository %s", models.ErrNotFound, repository)
	}

	out := make([]models.Image, 0, len(tags))
	for _, img := range tags {
		out = append(out, img)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Tag < out[j].Tag })
	return out, nil
}

func (m *MockRegistry) GetImage(ctx context.Context, repository, tag string) (*models.Image, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()

	tags, ok := m.images[repository]
	if !ok {
		return nil, fmt.Errorf("%w: repository %s", models.ErrNotFound, repository)
	}
	img, ok := tags[tag]
	if !ok {
		return nil, fmt.Errorf("%w: image %s:%s", models.ErrNotFound, repository, tag)
	}
	return &img, nil
}

func (m *MockRegistry) DeleteImage(ctx context.Context, repository, tag string) error {
	if err := m.fail(); err != nil {
		return err
	}
	if m.DeleteDisabled {
		return fmt.Errorf("%w: image deletion is disabled on this registry", models.ErrNotSupported)
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	tags, ok := m.images[repository]
	if !ok {
		return fmt.Errorf("%w: repository %s", models.ErrNotFound, repository)
	}
	if _, ok := tags[tag]; !ok {
		return fmt.Errorf("%w: image %s:%s", models.ErrNotFound, repository, tag)
	}
	delete(tags, tag)
	if len(tags) == 0 {
		delete(m.images, repository)
	}
	return nil
}

func (m *MockRegistry) DeleteRepository(ctx context.Context, name string) error {
	if err := m.fail(); err != nil {
		return err
	}
	if m.DeleteDisabled {
		return fmt.Errorf("%w: image deletion is disabled on this registry", models.ErrNotSupported)
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.images[name]; !ok {
		return fmt.Errorf("%w: repository %s", models.ErrNotFound, name)
	}
	delete(m.images, name)
	return nil
}

// SeedImage adds an image to the mock registry, for tests.
func (m *MockRegistry) SeedImage(repository, tag string, sizeBytes int64) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.images[repository] == nil {
		m.images[repository] = make(map[string]models.Image)
	}
	now := time.Now().UTC()
	m.images[repository][tag] = models.Image{
		Repository:   repository,
		Tag:          tag,
		Digest:       "sha256:" + strings.Repeat("a", 64),
		SizeBytes:    sizeBytes,
		PushedAt:     &now,
		Architecture: "amd64",
		OS:           "linux",
	}
}

// Ensure the mocks satisfy the same interfaces as the real clients.
var (
	_ ContainerEngine = (*MockEngine)(nil)
	_ ImageRegistry   = (*MockRegistry)(nil)
)
