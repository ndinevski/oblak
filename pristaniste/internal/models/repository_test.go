package models

import "testing"

func TestCreateRepositoryRequestValidate(t *testing.T) {
	tests := []struct {
		name    string
		request CreateRepositoryRequest
		wantErr bool
		field   string
	}{
		{"simple name", CreateRepositoryRequest{Name: "my-app"}, false, ""},
		{"with path components", CreateRepositoryRequest{Name: "team/my-app"}, false, ""},
		{"deep path", CreateRepositoryRequest{Name: "org/team/my-app"}, false, ""},
		{"separators", CreateRepositoryRequest{Name: "my.app_v2-final"}, false, ""},
		{"digits only", CreateRepositoryRequest{Name: "123"}, false, ""},

		{"empty", CreateRepositoryRequest{Name: ""}, true, "name"},
		{"whitespace only", CreateRepositoryRequest{Name: "   "}, true, "name"},
		// The registry rejects uppercase, so it must be rejected here rather
		// than at push time.
		{"uppercase", CreateRepositoryRequest{Name: "MyApp"}, true, "name"},
		{"leading separator", CreateRepositoryRequest{Name: "-app"}, true, "name"},
		{"trailing separator", CreateRepositoryRequest{Name: "app-"}, true, "name"},
		{"double separator", CreateRepositoryRequest{Name: "my--app"}, true, "name"},
		{"leading slash", CreateRepositoryRequest{Name: "/app"}, true, "name"},
		{"trailing slash", CreateRepositoryRequest{Name: "app/"}, true, "name"},
		{"spaces inside", CreateRepositoryRequest{Name: "my app"}, true, "name"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := tt.request
			err := req.Validate()

			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected an error for %q, got none", tt.request.Name)
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
				t.Fatalf("expected no error for %q, got %v", tt.request.Name, err)
			}
		})
	}
}

func TestCreateRepositoryRequestTrimsName(t *testing.T) {
	req := CreateRepositoryRequest{Name: "  my-app  "}
	if err := req.Validate(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// A name with stray whitespace would produce an unusable push URI.
	if req.Name != "my-app" {
		t.Errorf("expected the name to be trimmed, got %q", req.Name)
	}
}

func TestCreateRepositoryRequestRejectsOverlongName(t *testing.T) {
	long := make([]byte, 256)
	for i := range long {
		long[i] = 'a'
	}
	req := CreateRepositoryRequest{Name: string(long)}
	if err := req.Validate(); err == nil {
		t.Error("expected a 256-character name to be rejected")
	}
}

func TestParseImageReference(t *testing.T) {
	tests := []struct {
		name     string
		ref      string
		wantRepo string
		wantTag  string
		wantErr  bool
	}{
		{"bare name defaults to latest", "my-app", "my-app", "latest", false},
		{"explicit tag", "my-app:v1", "my-app", "v1", false},
		{"path and tag", "team/my-app:2.1.0", "team/my-app", "2.1.0", false},
		// A registry host carries a port, so the colon in it must not be read
		// as a tag separator.
		{"registry with port", "localhost:5000/my-app", "localhost:5000/my-app", "latest", false},
		{"registry with port and tag", "localhost:5000/my-app:v1", "localhost:5000/my-app", "v1", false},
		{"digest reference", "my-app@sha256:abc123", "my-app", "sha256:abc123", false},

		{"empty", "", "", "", true},
		{"whitespace", "   ", "", "", true},
		{"trailing colon", "my-app:", "", "", true},
		{"digest with no repository", "@sha256:abc", "", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo, tag, err := ParseImageReference(tt.ref)

			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected an error for %q, got repo=%q tag=%q", tt.ref, repo, tag)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error for %q: %v", tt.ref, err)
			}
			if repo != tt.wantRepo {
				t.Errorf("repository: expected %q, got %q", tt.wantRepo, repo)
			}
			if tag != tt.wantTag {
				t.Errorf("tag: expected %q, got %q", tt.wantTag, tag)
			}
		})
	}
}

func TestImageReference(t *testing.T) {
	img := Image{Repository: "my-app", Tag: "v1"}

	if got := img.Reference("localhost:5000"); got != "localhost:5000/my-app:v1" {
		t.Errorf("expected localhost:5000/my-app:v1, got %q", got)
	}
	// A host with a trailing slash must not produce a double slash.
	if got := img.Reference("localhost:5000/"); got != "localhost:5000/my-app:v1" {
		t.Errorf("expected the trailing slash to be trimmed, got %q", got)
	}
}

func TestIsValidRepositoryName(t *testing.T) {
	valid := []string{"app", "my-app", "team/app", "a.b_c-d"}
	for _, name := range valid {
		if !IsValidRepositoryName(name) {
			t.Errorf("expected %q to be valid", name)
		}
	}

	invalid := []string{"", "App", "-app", "app/", "my app", "a//b"}
	for _, name := range invalid {
		if IsValidRepositoryName(name) {
			t.Errorf("expected %q to be invalid", name)
		}
	}
}
