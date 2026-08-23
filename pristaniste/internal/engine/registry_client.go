package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/oblak/pristaniste/internal/models"
)

// RegistryClient talks to a Docker Distribution (registry v2) HTTP API.
//
// This is the ECR-shaped half of Pristaniste. The registry itself is a stock
// registry:2 container, exactly as Spomen wraps a stock MinIO: Pristaniste supplies
// the management API and the dashboard, not the storage.
type RegistryClient struct {
	baseURL    string
	publicHost string
	username   string
	password   string
	http       *http.Client
}

// RegistryConfig configures the registry connection.
type RegistryConfig struct {
	// URL is the registry's API endpoint, e.g. http://pristaniste-registry:5000.
	URL string
	// PublicHost is what clients put in an image reference, e.g.
	// localhost:5000. It differs from URL whenever Pristaniste reaches the registry
	// over a container network but users reach it from the host.
	PublicHost string
	Username   string
	Password   string
	Timeout    time.Duration
}

// NewRegistryClient creates a registry client.
func NewRegistryClient(cfg RegistryConfig) *RegistryClient {
	timeout := cfg.Timeout
	if timeout == 0 {
		timeout = 30 * time.Second
	}

	public := cfg.PublicHost
	if public == "" {
		// Fall back to the API URL with its scheme stripped, which is the
		// right answer whenever Pristaniste and its clients share a network.
		public = strings.TrimPrefix(strings.TrimPrefix(cfg.URL, "https://"), "http://")
	}

	return &RegistryClient{
		baseURL:    strings.TrimSuffix(cfg.URL, "/"),
		publicHost: strings.TrimSuffix(public, "/"),
		username:   cfg.Username,
		password:   cfg.Password,
		http:       &http.Client{Timeout: timeout},
	}
}

// Host returns the endpoint clients push and pull from.
func (r *RegistryClient) Host() string {
	return r.publicHost
}

// do issues a registry API request with auth applied.
func (r *RegistryClient) do(ctx context.Context, method, path string, headers map[string]string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, r.baseURL+path, nil)
	if err != nil {
		return nil, fmt.Errorf("build registry request: %w", err)
	}
	if r.username != "" {
		req.SetBasicAuth(r.username, r.password)
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	resp, err := r.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("registry unreachable: %w", err)
	}
	return resp, nil
}

// HealthCheck verifies the registry answers its version endpoint.
func (r *RegistryClient) HealthCheck(ctx context.Context) error {
	resp, err := r.do(ctx, http.MethodGet, "/v2/", nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	// A registry requiring auth answers 401 here, which still proves it is up.
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusUnauthorized {
		return fmt.Errorf("registry returned %d from /v2/", resp.StatusCode)
	}
	return nil
}

// ListRepositories returns every repository in the registry.
func (r *RegistryClient) ListRepositories(ctx context.Context) ([]models.Repository, error) {
	resp, err := r.do(ctx, http.MethodGet, "/v2/_catalog?n=1000", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("registry catalog returned %d", resp.StatusCode)
	}

	var body struct {
		Repositories []string `json:"repositories"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("decode catalog: %w", err)
	}

	out := make([]models.Repository, 0, len(body.Repositories))
	for _, name := range body.Repositories {
		repo := models.Repository{
			Name:   name,
			URI:    fmt.Sprintf("%s/%s", r.publicHost, name),
			Exists: true,
		}

		// The catalog gives names only, so size and tag counts need a second
		// call per repository. Failures are tolerated: a repository mid-push
		// can briefly have no readable manifest, and the whole listing should
		// not fail because of one.
		if images, err := r.ListImages(ctx, name); err == nil {
			repo.ImageCount = len(images)
			for _, img := range images {
				repo.SizeBytes += img.SizeBytes
				if img.PushedAt != nil && (repo.UpdatedAt == nil || img.PushedAt.After(*repo.UpdatedAt)) {
					repo.UpdatedAt = img.PushedAt
					repo.LatestTag = img.Tag
				}
			}
			if repo.LatestTag == "" && len(images) > 0 {
				repo.LatestTag = images[0].Tag
			}
		}

		out = append(out, repo)
	}

	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

// GetRepository returns one repository.
func (r *RegistryClient) GetRepository(ctx context.Context, name string) (*models.Repository, error) {
	images, err := r.ListImages(ctx, name)
	if err != nil {
		return nil, err
	}

	repo := &models.Repository{
		Name:       name,
		URI:        fmt.Sprintf("%s/%s", r.publicHost, name),
		Exists:     true,
		ImageCount: len(images),
	}
	for _, img := range images {
		repo.SizeBytes += img.SizeBytes
		if img.PushedAt != nil && (repo.UpdatedAt == nil || img.PushedAt.After(*repo.UpdatedAt)) {
			repo.UpdatedAt = img.PushedAt
			repo.LatestTag = img.Tag
		}
	}
	return repo, nil
}

// manifestAccept asks for both current manifest media types. Without it the
// registry returns a v1 manifest, which carries no layer sizes or digest.
const manifestAccept = "application/vnd.docker.distribution.manifest.v2+json, " +
	"application/vnd.oci.image.manifest.v1+json, " +
	"application/vnd.docker.distribution.manifest.list.v2+json, " +
	"application/vnd.oci.image.index.v1+json"

// ListImages returns every tag in a repository.
func (r *RegistryClient) ListImages(ctx context.Context, repository string) ([]models.Image, error) {
	if !models.IsValidRepositoryName(repository) {
		return nil, &models.ValidationError{Field: "repository", Message: "invalid repository name"}
	}

	resp, err := r.do(ctx, http.MethodGet, fmt.Sprintf("/v2/%s/tags/list", repository), nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("%w: repository %s", models.ErrNotFound, repository)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("registry tags/list returned %d", resp.StatusCode)
	}

	var body struct {
		Name string   `json:"name"`
		Tags []string `json:"tags"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("decode tags: %w", err)
	}

	// A repository whose tags were all deleted returns null rather than [].
	if body.Tags == nil {
		return []models.Image{}, nil
	}

	// Group by digest so tags pointing at the same manifest can warn about
	// each other: deleting one deletes them all.
	byDigest := map[string][]string{}
	images := make([]models.Image, 0, len(body.Tags))

	for _, tag := range body.Tags {
		img, err := r.GetImage(ctx, repository, tag)
		if err != nil {
			// Skip a tag whose manifest cannot be read rather than failing the
			// whole listing.
			continue
		}
		images = append(images, *img)
		byDigest[img.Digest] = append(byDigest[img.Digest], tag)
	}

	for i := range images {
		for _, tag := range byDigest[images[i].Digest] {
			if tag != images[i].Tag {
				images[i].SharedTags = append(images[i].SharedTags, tag)
			}
		}
	}

	sort.Slice(images, func(i, j int) bool { return images[i].Tag < images[j].Tag })
	return images, nil
}

// GetImage returns one tagged image with its digest and size.
func (r *RegistryClient) GetImage(ctx context.Context, repository, tag string) (*models.Image, error) {
	resp, err := r.do(ctx, http.MethodGet,
		fmt.Sprintf("/v2/%s/manifests/%s", repository, tag),
		map[string]string{"Accept": manifestAccept})
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("%w: image %s:%s", models.ErrNotFound, repository, tag)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("registry manifest returned %d", resp.StatusCode)
	}

	var manifest struct {
		Config struct {
			Size   int64  `json:"size"`
			Digest string `json:"digest"`
		} `json:"config"`
		Layers []struct {
			Size int64 `json:"size"`
		} `json:"layers"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&manifest); err != nil {
		return nil, fmt.Errorf("decode manifest: %w", err)
	}

	img := &models.Image{
		Repository: repository,
		Tag:        tag,
		// The digest of the manifest itself is only available in this header;
		// it is not part of the manifest body. Deletion needs it.
		Digest: resp.Header.Get("Docker-Content-Digest"),
	}
	img.SizeBytes = manifest.Config.Size
	for _, l := range manifest.Layers {
		img.SizeBytes += l.Size
	}

	// The image config blob carries the platform and creation time. It is a
	// second round trip, so a failure only costs detail, not the whole image.
	if manifest.Config.Digest != "" {
		if cfg, err := r.fetchImageConfig(ctx, repository, manifest.Config.Digest); err == nil {
			img.Architecture = cfg.Architecture
			img.OS = cfg.OS
			if !cfg.Created.IsZero() {
				created := cfg.Created
				img.PushedAt = &created
			}
		}
	}

	return img, nil
}

type imageConfig struct {
	Architecture string    `json:"architecture"`
	OS           string    `json:"os"`
	Created      time.Time `json:"created"`
}

func (r *RegistryClient) fetchImageConfig(ctx context.Context, repository, digest string) (*imageConfig, error) {
	resp, err := r.do(ctx, http.MethodGet, fmt.Sprintf("/v2/%s/blobs/%s", repository, digest), nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("registry blob returned %d", resp.StatusCode)
	}

	var cfg imageConfig
	if err := json.NewDecoder(resp.Body).Decode(&cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

// DeleteImage removes the manifest a tag points at.
//
// The registry has no concept of deleting a tag: deletion is by digest, so
// every tag sharing that digest goes with it. Image.SharedTags exists so the
// dashboard can say so before the user confirms.
func (r *RegistryClient) DeleteImage(ctx context.Context, repository, tag string) error {
	img, err := r.GetImage(ctx, repository, tag)
	if err != nil {
		return err
	}
	if img.Digest == "" {
		return fmt.Errorf("%w: registry did not report a manifest digest", models.ErrNotSupported)
	}

	resp, err := r.do(ctx, http.MethodDelete,
		fmt.Sprintf("/v2/%s/manifests/%s", repository, img.Digest), nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusAccepted, http.StatusOK, http.StatusNoContent:
		return nil
	case http.StatusNotFound:
		return fmt.Errorf("%w: image %s:%s", models.ErrNotFound, repository, tag)
	case http.StatusMethodNotAllowed:
		// The registry was started without REGISTRY_STORAGE_DELETE_ENABLED.
		return fmt.Errorf("%w: image deletion is disabled on this registry", models.ErrNotSupported)
	default:
		return fmt.Errorf("registry delete returned %d", resp.StatusCode)
	}
}

// DeleteRepository removes every image in a repository.
//
// The registry API has no repository-level delete, so this deletes each
// manifest in turn. The empty repository name may linger in the catalog until
// garbage collection runs, which is a property of the registry, not a bug here.
func (r *RegistryClient) DeleteRepository(ctx context.Context, name string) error {
	images, err := r.ListImages(ctx, name)
	if err != nil {
		return err
	}

	// Delete by unique digest: several tags commonly share one manifest, and
	// the second delete of the same digest would 404.
	seen := map[string]bool{}
	for _, img := range images {
		if img.Digest == "" || seen[img.Digest] {
			continue
		}
		seen[img.Digest] = true
		if err := r.DeleteImage(ctx, name, img.Tag); err != nil {
			return err
		}
	}
	return nil
}
