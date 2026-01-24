package models

import (
	"testing"
)

func TestCreateVMRequestValidate(t *testing.T) {
	tests := []struct {
		name    string
		request CreateVMRequest
		wantErr bool
	}{
		{
			name: "valid request with template",
			request: CreateVMRequest{
				Name:     "test-vm",
				Template: "ubuntu-22.04",
				Size:     "small",
			},
			wantErr: false,
		},
		{
			name: "valid request with os_template",
			request: CreateVMRequest{
				Name:       "test-vm",
				OSTemplate: "ubuntu-22.04-cloudimg-amd64.img",
				Cores:      2,
				Memory:     2048,
				DiskSize:   20,
			},
			wantErr: false,
		},
		{
			name: "missing name",
			request: CreateVMRequest{
				Template: "ubuntu-22.04",
			},
			wantErr: true,
		},
		{
			name: "missing template and os_template",
			request: CreateVMRequest{
				Name: "test-vm",
			},
			wantErr: true,
		},
		{
			name: "invalid size",
			request: CreateVMRequest{
				Name:     "test-vm",
				Template: "ubuntu-22.04",
				Size:     "invalid-size",
			},
			wantErr: true,
		},
		{
			name: "name too short",
			request: CreateVMRequest{
				Name:     "a",
				Template: "ubuntu-22.04",
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.request.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestVMActionRequestValidate(t *testing.T) {
	tests := []struct {
		name    string
		request VMActionRequest
		wantErr bool
	}{
		{
			name:    "valid start action",
			request: VMActionRequest{Action: ActionStart},
			wantErr: false,
		},
		{
			name:    "valid stop action",
			request: VMActionRequest{Action: ActionStop},
			wantErr: false,
		},
		{
			name:    "valid snapshot action with name",
			request: VMActionRequest{Action: ActionSnapshot, SnapshotName: "my-snapshot"},
			wantErr: false,
		},
		{
			name:    "snapshot action without name",
			request: VMActionRequest{Action: ActionSnapshot},
			wantErr: true,
		},
		{
			name:    "clone action without name",
			request: VMActionRequest{Action: ActionClone},
			wantErr: true,
		},
		{
			name:    "empty action",
			request: VMActionRequest{},
			wantErr: true,
		},
		{
			name:    "invalid action",
			request: VMActionRequest{Action: "invalid"},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.request.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestGetSizeByName(t *testing.T) {
	tests := []struct {
		name     string
		sizeName string
		want     *VMSize
	}{
		{
			name:     "small size",
			sizeName: "small",
			want:     &VMSize{Name: "small", Cores: 1, Memory: 1024, DiskSize: 20},
		},
		{
			name:     "large size",
			sizeName: "large",
			want:     &VMSize{Name: "large", Cores: 4, Memory: 4096, DiskSize: 80},
		},
		{
			name:     "invalid size",
			sizeName: "invalid",
			want:     nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := GetSizeByName(tt.sizeName)
			if tt.want == nil {
				if got != nil {
					t.Errorf("GetSizeByName() = %v, want nil", got)
				}
				return
			}
			if got == nil {
				t.Errorf("GetSizeByName() = nil, want %v", tt.want)
				return
			}
			if got.Name != tt.want.Name || got.Cores != tt.want.Cores {
				t.Errorf("GetSizeByName() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCreateSnapshotRequestValidate(t *testing.T) {
	tests := []struct {
		name    string
		request CreateSnapshotRequest
		wantErr bool
	}{
		{
			name:    "valid request",
			request: CreateSnapshotRequest{Name: "my-snapshot"},
			wantErr: false,
		},
		{
			name:    "empty name",
			request: CreateSnapshotRequest{},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.request.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
