package engine

import (
	"context"
	"errors"
	"testing"

	"github.com/oblak/brod/internal/models"
)

func TestMockEngineLifecycle(t *testing.T) {
	ctx := context.Background()
	m := NewMockEngine()

	created, err := m.CreateContainer(ctx, &models.CreateContainerRequest{
		Name:  "web",
		Image: "nginx:alpine",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if created.Status != models.ContainerStatusRunning {
		t.Errorf("expected a started container to be running, got %q", created.Status)
	}
	// Every container the mock creates must carry the managed label, because
	// the real client uses it to avoid touching foreign containers.
	if created.Labels[ManagedLabel] != "true" {
		t.Error("expected the managed label to be set")
	}

	if err := m.StopContainer(ctx, "web", nil); err != nil {
		t.Fatalf("stop: %v", err)
	}
	got, _ := m.GetContainer(ctx, "web")
	if got.Status != models.ContainerStatusExited {
		t.Errorf("expected exited after a stop, got %q", got.Status)
	}

	if err := m.StartContainer(ctx, "web"); err != nil {
		t.Fatalf("start: %v", err)
	}
	got, _ = m.GetContainer(ctx, "web")
	if got.Status != models.ContainerStatusRunning {
		t.Errorf("expected running after a start, got %q", got.Status)
	}
}

func TestMockEngineResolvesByIDAndName(t *testing.T) {
	ctx := context.Background()
	m := NewMockEngine()

	created, _ := m.CreateContainer(ctx, &models.CreateContainerRequest{Name: "web", Image: "nginx"})

	byName, err := m.GetContainer(ctx, "web")
	if err != nil {
		t.Fatalf("lookup by name: %v", err)
	}
	byID, err := m.GetContainer(ctx, created.ID)
	if err != nil {
		t.Fatalf("lookup by id: %v", err)
	}
	if byName.ID != byID.ID {
		t.Error("expected lookup by name and by id to resolve to the same container")
	}
}

func TestMockEngineRejectsDuplicateName(t *testing.T) {
	ctx := context.Background()
	m := NewMockEngine()
	req := &models.CreateContainerRequest{Name: "web", Image: "nginx"}

	if _, err := m.CreateContainer(ctx, req); err != nil {
		t.Fatalf("first create: %v", err)
	}
	_, err := m.CreateContainer(ctx, req)
	if !errors.Is(err, models.ErrAlreadyExists) {
		t.Errorf("expected ErrAlreadyExists, got %v", err)
	}
}

func TestMockEngineNotFound(t *testing.T) {
	ctx := context.Background()
	m := NewMockEngine()

	_, err := m.GetContainer(ctx, "missing")
	if !errors.Is(err, models.ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestMockEngineRemoveRequiresForceWhileRunning(t *testing.T) {
	ctx := context.Background()
	m := NewMockEngine()
	m.CreateContainer(ctx, &models.CreateContainerRequest{Name: "web", Image: "nginx"})

	if err := m.RemoveContainer(ctx, "web", false); err == nil {
		t.Error("expected removing a running container without force to fail")
	}
	if err := m.RemoveContainer(ctx, "web", true); err != nil {
		t.Errorf("expected a forced remove to succeed, got %v", err)
	}
}

func TestMockEngineListFiltersByRunning(t *testing.T) {
	ctx := context.Background()
	m := NewMockEngine()
	m.CreateContainer(ctx, &models.CreateContainerRequest{Name: "up", Image: "nginx"})

	stopped := false
	m.CreateContainer(ctx, &models.CreateContainerRequest{
		Name: "down", Image: "nginx", Start: &stopped,
	})

	running, _ := m.ListContainers(ctx, false)
	if len(running) != 1 {
		t.Errorf("expected 1 running container, got %d", len(running))
	}

	all, _ := m.ListContainers(ctx, true)
	if len(all) != 2 {
		t.Errorf("expected 2 containers with all=true, got %d", len(all))
	}
}

func TestMockEngineFailureMode(t *testing.T) {
	ctx := context.Background()
	m := NewMockEngine()
	m.ShouldFail = true

	if err := m.HealthCheck(ctx); err == nil {
		t.Error("expected the health check to fail")
	}
	if _, err := m.ListContainers(ctx, true); err == nil {
		t.Error("expected the list to fail")
	}
}

func TestMockRegistrySeedAndList(t *testing.T) {
	ctx := context.Background()
	r := NewMockRegistry()
	r.SeedImage("my-app", "v1", 1024)
	r.SeedImage("my-app", "v2", 2048)

	repos, err := r.ListRepositories(ctx)
	if err != nil {
		t.Fatalf("list repositories: %v", err)
	}
	if len(repos) != 1 {
		t.Fatalf("expected 1 repository, got %d", len(repos))
	}
	if repos[0].SizeBytes != 3072 {
		t.Errorf("expected the image sizes to be summed, got %d", repos[0].SizeBytes)
	}

	images, err := r.ListImages(ctx, "my-app")
	if err != nil {
		t.Fatalf("list images: %v", err)
	}
	if len(images) != 2 {
		t.Errorf("expected 2 images, got %d", len(images))
	}
	// Sorted output keeps the dashboard's ordering stable between refreshes.
	if images[0].Tag != "v1" {
		t.Errorf("expected images sorted by tag, got %q first", images[0].Tag)
	}
}

func TestMockRegistryDeleteRemovesEmptyRepository(t *testing.T) {
	ctx := context.Background()
	r := NewMockRegistry()
	r.SeedImage("my-app", "v1", 1024)

	if err := r.DeleteImage(ctx, "my-app", "v1"); err != nil {
		t.Fatalf("delete image: %v", err)
	}

	// Deleting the last image leaves no repository behind.
	if _, err := r.GetRepository(ctx, "my-app"); !errors.Is(err, models.ErrNotFound) {
		t.Errorf("expected the repository to be gone, got %v", err)
	}
}

func TestMockRegistryDeleteDisabled(t *testing.T) {
	ctx := context.Background()
	r := NewMockRegistry()
	r.SeedImage("my-app", "v1", 1024)
	r.DeleteDisabled = true

	err := r.DeleteImage(ctx, "my-app", "v1")
	if !errors.Is(err, models.ErrNotSupported) {
		t.Errorf("expected ErrNotSupported, got %v", err)
	}
}

func TestMockRegistryNotFound(t *testing.T) {
	ctx := context.Background()
	r := NewMockRegistry()

	if _, err := r.ListImages(ctx, "nope"); !errors.Is(err, models.ErrNotFound) {
		t.Errorf("expected ErrNotFound for a missing repository, got %v", err)
	}
}

// TestQualifyImage pins the rule that decides whether a reference is rewritten
// to point at Brod's own registry. Getting this wrong would either break
// public images or silently pull the wrong thing.
func TestQualifyImage(t *testing.T) {
	d := &DockerClient{registry: "localhost:5000"}

	tests := []struct {
		name  string
		input string
		want  string
	}{
		{"bare name is qualified", "my-app:v1", "localhost:5000/my-app:v1"},
		{"namespaced name is qualified", "team/my-app:v1", "localhost:5000/team/my-app:v1"},
		{"already qualified is untouched", "localhost:5000/my-app:v1", "localhost:5000/my-app:v1"},
		// A first component with a dot or colon is a registry host, so these
		// are already fully qualified and must not be rewritten.
		{"docker hub host is untouched", "docker.io/library/nginx", "docker.io/library/nginx"},
		{"other registry is untouched", "ghcr.io/owner/img:v1", "ghcr.io/owner/img:v1"},
		{"other localhost port is untouched", "localhost:6000/img", "localhost:6000/img"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := d.qualifyImage(tt.input); got != tt.want {
				t.Errorf("qualifyImage(%q): expected %q, got %q", tt.input, tt.want, got)
			}
		})
	}
}

func TestQualifyImageWithoutRegistryConfigured(t *testing.T) {
	d := &DockerClient{registry: ""}
	// With no registry configured nothing should be rewritten.
	if got := d.qualifyImage("my-app:v1"); got != "my-app:v1" {
		t.Errorf("expected the reference to be untouched, got %q", got)
	}
}

func TestShortID(t *testing.T) {
	long := "0123456789abcdef0123456789abcdef"
	if got := shortID(long); got != "0123456789ab" {
		t.Errorf("expected a 12-character id, got %q", got)
	}
	// A short id must pass through rather than panicking on the slice.
	if got := shortID("abc"); got != "abc" {
		t.Errorf("expected a short id to pass through, got %q", got)
	}
}

func TestParseEnv(t *testing.T) {
	got := parseEnv([]string{"FOO=bar", "EMPTY=", "NOEQUALS", "URL=http://x/?a=b"})

	if got["FOO"] != "bar" {
		t.Errorf("expected FOO=bar, got %q", got["FOO"])
	}
	if _, ok := got["EMPTY"]; !ok {
		t.Error("expected an empty value to still be present")
	}
	// A malformed entry with no '=' has no key and must be skipped.
	if _, ok := got["NOEQUALS"]; ok {
		t.Error("expected an entry with no '=' to be skipped")
	}
	// Only the first '=' separates key from value.
	if got["URL"] != "http://x/?a=b" {
		t.Errorf("expected the value to keep later '=' characters, got %q", got["URL"])
	}

	if parseEnv(nil) != nil {
		t.Error("expected nil for an empty environment")
	}
}

func TestParseLogLine(t *testing.T) {
	entry, ok := parseLogLine("2026-08-22T10:00:00.000000000Z hello world", "stdout")
	if !ok {
		t.Fatal("expected the line to parse")
	}
	if entry.Message != "hello world" {
		t.Errorf("expected the timestamp to be stripped, got %q", entry.Message)
	}
	if entry.Timestamp.IsZero() {
		t.Error("expected the timestamp to be parsed")
	}

	// A line without a leading timestamp must still be returned intact.
	plain, ok := parseLogLine("no timestamp here", "stderr")
	if !ok {
		t.Fatal("expected the plain line to parse")
	}
	if plain.Message != "no timestamp here" {
		t.Errorf("expected the message to be preserved, got %q", plain.Message)
	}

	if _, ok := parseLogLine("   ", "stdout"); ok {
		t.Error("expected a blank line to be skipped")
	}
}
