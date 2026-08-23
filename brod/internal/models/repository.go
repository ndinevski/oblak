package models

import (
	"fmt"
	"regexp"
	"strings"
	"time"
)

// =============================================================================
// Image repositories (the ECR-shaped half of Brod)
// =============================================================================

// Repository is a named collection of container images, the equivalent of an
// ECR repository. Repositories are not created by Brod's own storage: they
// come into existence in the backing registry the first time an image is
// pushed to that name, which is how the Docker registry protocol works.
// Creating one through the API therefore records intent, and the repository
// shows as empty until something is pushed.
type Repository struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`

	// URI a client passes to `docker push` / `docker pull`, for example
	// localhost:5000/my-app. Rendered by the server because it depends on how
	// the registry is published, which the client cannot know.
	URI string `json:"uri"`

	ImageCount int   `json:"image_count"`
	SizeBytes  int64 `json:"size_bytes"`

	// Tag of the most recently pushed image, when known.
	LatestTag string     `json:"latest_tag,omitempty"`
	UpdatedAt *time.Time `json:"updated_at,omitempty"`

	// Whether the repository exists in the backing registry yet, as opposed to
	// having only been declared through the API.
	Exists bool `json:"exists"`
}

// Image is a single tagged image inside a repository, the equivalent of an ECR
// image. A digest can carry several tags, so two Images may share a Digest.
type Image struct {
	Repository string `json:"repository"`
	Tag        string `json:"tag"`

	// Content-addressable manifest digest (sha256:...). This is what the
	// registry deletes by; tags are only pointers to it.
	Digest string `json:"digest"`

	SizeBytes int64      `json:"size_bytes"`
	PushedAt  *time.Time `json:"pushed_at,omitempty"`

	// Platform the image was built for, when the manifest reports it.
	Architecture string `json:"architecture,omitempty"`
	OS           string `json:"os,omitempty"`

	// Other tags pointing at the same digest, so the UI can warn that deleting
	// this digest also removes them.
	SharedTags []string `json:"shared_tags,omitempty"`
}

// Reference returns the pullable reference for an image, e.g.
// localhost:5000/my-app:v1.
func (i *Image) Reference(registryHost string) string {
	return fmt.Sprintf("%s/%s:%s", strings.TrimSuffix(registryHost, "/"), i.Repository, i.Tag)
}

// =============================================================================
// Requests
// =============================================================================

// CreateRepositoryRequest declares a repository ahead of the first push.
type CreateRepositoryRequest struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}

// repositoryNameRe mirrors the Docker registry's own repository grammar:
// lowercase alphanumerics separated by single ., _, __ or - characters, in
// path components joined by /. Enforcing it here means a name that would be
// rejected at push time is rejected at creation time instead.
var repositoryNameRe = regexp.MustCompile(`^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$`)

// Validate checks the request is well formed.
func (r *CreateRepositoryRequest) Validate() error {
	name := strings.TrimSpace(r.Name)
	if name == "" {
		return &ValidationError{Field: "name", Message: "name is required"}
	}
	if len(name) > 255 {
		return &ValidationError{Field: "name", Message: "name must be 255 characters or fewer"}
	}
	if !repositoryNameRe.MatchString(name) {
		return &ValidationError{
			Field: "name",
			Message: "name must be lowercase alphanumeric, optionally separated by '.', '_' or '-', " +
				"with '/' between path components",
		}
	}
	r.Name = name
	return nil
}

// IsValidRepositoryName reports whether a name is acceptable to the registry.
func IsValidRepositoryName(name string) bool {
	return name != "" && len(name) <= 255 && repositoryNameRe.MatchString(name)
}

// ParseImageReference splits a reference such as "my-app:v1" or
// "team/my-app@sha256:abc" into its repository and tag or digest.
//
// A reference without a tag defaults to "latest", matching Docker.
func ParseImageReference(ref string) (repository, tag string, err error) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return "", "", &ValidationError{Field: "image", Message: "image reference is required"}
	}

	// A digest reference pins an exact manifest and has no tag.
	if idx := strings.Index(ref, "@"); idx != -1 {
		repository = ref[:idx]
		tag = ref[idx+1:]
		if repository == "" || tag == "" {
			return "", "", &ValidationError{Field: "image", Message: "malformed digest reference"}
		}
		return repository, tag, nil
	}

	// Only the last colon can introduce a tag, and only when it appears after
	// the final slash: a registry host may carry a port, as in
	// "localhost:5000/my-app".
	slash := strings.LastIndex(ref, "/")
	colon := strings.LastIndex(ref, ":")
	if colon > slash {
		repository = ref[:colon]
		tag = ref[colon+1:]
	} else {
		repository = ref
		tag = "latest"
	}

	if repository == "" || tag == "" {
		return "", "", &ValidationError{Field: "image", Message: "malformed image reference"}
	}
	return repository, tag, nil
}
