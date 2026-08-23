package models

import "testing"

func validCreate() CreateInstanceRequest {
	return CreateInstanceRequest{Name: "orders", Engine: EnginePostgres}
}

func TestCreateInstanceRequestValidate(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(*CreateInstanceRequest)
		wantErr bool
		field   string
	}{
		{"minimal valid", func(r *CreateInstanceRequest) {}, false, ""},
		{"mysql", func(r *CreateInstanceRequest) { r.Engine = EngineMySQL }, false, ""},
		{"explicit version", func(r *CreateInstanceRequest) { r.Version = "15" }, false, ""},

		{"empty name", func(r *CreateInstanceRequest) { r.Name = "" }, true, "name"},
		{"short name", func(r *CreateInstanceRequest) { r.Name = "ab" }, true, "name"},
		// Case is normalised rather than rejected, which is friendlier and is
		// asserted by TestCreateInstanceRequestLowercasesName.
		{"uppercase name is normalised", func(r *CreateInstanceRequest) { r.Name = "Orders" }, false, ""},
		{"name with underscore", func(r *CreateInstanceRequest) { r.Name = "my_db" }, true, "name"},
		{"name starting with a digit", func(r *CreateInstanceRequest) { r.Name = "1db" }, true, "name"},
		{"name ending with a dash", func(r *CreateInstanceRequest) { r.Name = "orders-" }, true, "name"},

		{"empty engine", func(r *CreateInstanceRequest) { r.Engine = "" }, true, "engine"},
		{"unknown engine", func(r *CreateInstanceRequest) { r.Engine = "mongodb" }, true, "engine"},
		{"unknown version", func(r *CreateInstanceRequest) { r.Version = "9.6" }, true, "version"},
		{"unknown size", func(r *CreateInstanceRequest) { r.Size = "gigantic" }, true, "size"},

		{"invalid database name", func(r *CreateInstanceRequest) { r.Database = "my-db" }, true, "database"},
		{"invalid username", func(r *CreateInstanceRequest) { r.Username = "my-user" }, true, "username"},
		// These collide with the superuser the engine images create.
		{"reserved username postgres", func(r *CreateInstanceRequest) { r.Username = "postgres" }, true, "username"},
		{"reserved username root", func(r *CreateInstanceRequest) { r.Username = "root" }, true, "username"},
		{"reserved username replicator", func(r *CreateInstanceRequest) { r.Username = "replicator" }, true, "username"},

		{"short password", func(r *CreateInstanceRequest) { r.Password = "abc" }, true, "password"},
		{"acceptable password", func(r *CreateInstanceRequest) { r.Password = "longenough" }, false, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := validCreate()
			tt.mutate(&req)
			err := req.Validate()

			if tt.wantErr {
				if err == nil {
					t.Fatal("expected an error, got none")
				}
				ve, ok := err.(*ValidationError)
				if !ok {
					t.Fatalf("expected a ValidationError, got %T", err)
				}
				if ve.Field != tt.field {
					t.Errorf("expected field %q, got %q (%s)", tt.field, ve.Field, ve.Message)
				}
				return
			}
			if err != nil {
				t.Fatalf("expected no error, got %v", err)
			}
		})
	}
}

func TestCreateInstanceRequestDefaults(t *testing.T) {
	req := CreateInstanceRequest{Name: "orders", Engine: EnginePostgres}
	if err := req.Validate(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if req.Size != "small" {
		t.Errorf("expected the size to default to small, got %q", req.Size)
	}
	if req.Username != "tefter" {
		t.Errorf("expected the username to default to tefter, got %q", req.Username)
	}
	if req.Database != "orders" {
		t.Errorf("expected the database to default to the instance name, got %q", req.Database)
	}
}

// A hyphen is legal in an instance name but not in an unquoted SQL
// identifier, so the derived database name has to substitute it.
func TestCreateInstanceRequestDerivesDatabaseFromHyphenatedName(t *testing.T) {
	req := CreateInstanceRequest{Name: "order-service", Engine: EngineMySQL}
	if err := req.Validate(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if req.Database != "order_service" {
		t.Errorf("expected hyphens to become underscores, got %q", req.Database)
	}
}

func TestCreateInstanceRequestLowercasesName(t *testing.T) {
	req := CreateInstanceRequest{Name: "  Orders  ", Engine: EnginePostgres}
	if err := req.Validate(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if req.Name != "orders" {
		t.Errorf("expected the name to be trimmed and lowercased, got %q", req.Name)
	}
}

func TestResolveVersion(t *testing.T) {
	// An empty version picks the engine's default.
	v, err := ResolveVersion(EnginePostgres, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if v.Version != "16" {
		t.Errorf("expected postgres to default to 16, got %q", v.Version)
	}

	v, err = ResolveVersion(EngineMySQL, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if v.Version != "8.4" {
		t.Errorf("expected mysql to default to 8.4, got %q", v.Version)
	}

	if _, err := ResolveVersion(EnginePostgres, "15"); err != nil {
		t.Errorf("expected postgres 15 to resolve, got %v", err)
	}
	// A version belonging to the other engine must not resolve.
	if _, err := ResolveVersion(EnginePostgres, "8.0"); err == nil {
		t.Error("expected a mysql version to be rejected for postgres")
	}
	if _, err := ResolveVersion("mongodb", ""); err == nil {
		t.Error("expected an unknown engine to be rejected")
	}
}

func TestCreateReplicaRequestValidate(t *testing.T) {
	tests := []struct {
		name    string
		request CreateReplicaRequest
		wantErr bool
		field   string
	}{
		{"valid", CreateReplicaRequest{Name: "orders-ro", SourceInstance: "orders"}, false, ""},
		{"empty name", CreateReplicaRequest{SourceInstance: "orders"}, true, "name"},
		{"empty source", CreateReplicaRequest{Name: "orders-ro"}, true, "source_instance"},
		// A replica following itself would be an infinite loop of nothing.
		{"self reference", CreateReplicaRequest{Name: "orders", SourceInstance: "orders"}, true, "source_instance"},
		{"unknown size", CreateReplicaRequest{Name: "orders-ro", SourceInstance: "orders", Size: "huge"}, true, "size"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := tt.request
			err := req.Validate()

			if tt.wantErr {
				if err == nil {
					t.Fatal("expected an error, got none")
				}
				if ve, ok := err.(*ValidationError); ok && ve.Field != tt.field {
					t.Errorf("expected field %q, got %q", tt.field, ve.Field)
				}
				return
			}
			if err != nil {
				t.Fatalf("expected no error, got %v", err)
			}
		})
	}
}

func TestConnectionStringNeverCarriesAPassword(t *testing.T) {
	pg := &DBInstance{
		Engine: EnginePostgres, Username: "tefter", Host: "localhost", Port: 15000, Database: "orders",
	}
	got := pg.ConnectionString()
	if got != "postgresql://tefter:<password>@localhost:15000/orders" {
		t.Errorf("unexpected postgres connection string: %q", got)
	}

	my := &DBInstance{
		Engine: EngineMySQL, Username: "tefter", Host: "localhost", Port: 15001, Database: "orders",
	}
	got = my.ConnectionString()
	if got != "mysql://tefter:<password>@localhost:15001/orders" {
		t.Errorf("unexpected mysql connection string: %q", got)
	}
}

func TestIsReplica(t *testing.T) {
	if (&DBInstance{Role: RoleReplica}).IsReplica() != true {
		t.Error("expected a replica to report as one")
	}
	if (&DBInstance{Role: RolePrimary}).IsReplica() != false {
		t.Error("expected a primary not to report as a replica")
	}
}

func TestGetSizeByName(t *testing.T) {
	if s := GetSizeByName("small"); s == nil || s.MemoryMB != 1024 {
		t.Errorf("expected small to be 1024MB, got %+v", s)
	}
	if GetSizeByName("nonexistent") != nil {
		t.Error("expected an unknown size to return nil")
	}
}

func TestEngineDefaultPort(t *testing.T) {
	if EnginePostgres.DefaultPort() != 5432 {
		t.Error("expected postgres on 5432")
	}
	if EngineMySQL.DefaultPort() != 3306 {
		t.Error("expected mysql on 3306")
	}
	if Engine("mongodb").DefaultPort() != 0 {
		t.Error("expected an unknown engine to report no port")
	}
}
