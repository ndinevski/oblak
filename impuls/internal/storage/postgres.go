package storage

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	_ "github.com/lib/pq"
	"github.com/oblak/impuls/internal/models"
)

// PostgresStorage implements Storage using PostgreSQL
type PostgresStorage struct {
	db *sql.DB
}

// NewPostgresStorage creates a new PostgresStorage instance
func NewPostgresStorage(connStr string) (*PostgresStorage, error) {
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Test connection
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	ps := &PostgresStorage{db: db}

	// Initialize schema
	if err := ps.initSchema(); err != nil {
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}

	return ps, nil
}

// initSchema creates the necessary tables if they don't exist
func (ps *PostgresStorage) initSchema() error {
	schema := `
	CREATE TABLE IF NOT EXISTS functions (
		id TEXT PRIMARY KEY,
		name TEXT UNIQUE NOT NULL,
		description TEXT,
		runtime TEXT NOT NULL,
		handler TEXT NOT NULL,
		code TEXT NOT NULL,
		code_path TEXT,
		memory_mb INTEGER NOT NULL,
		timeout_sec INTEGER NOT NULL,
		environment JSONB,
		created_at TIMESTAMP NOT NULL,
		updated_at TIMESTAMP NOT NULL
	);

	CREATE INDEX IF NOT EXISTS idx_functions_name ON functions(name);
	CREATE INDEX IF NOT EXISTS idx_functions_created_at ON functions(created_at DESC);
	`

	_, err := ps.db.Exec(schema)
	return err
}

// Create creates a new function
func (ps *PostgresStorage) Create(fn *models.Function) error {
	envJSON, err := json.Marshal(fn.Environment)
	if err != nil {
		return fmt.Errorf("failed to marshal environment: %w", err)
	}

	query := `
		INSERT INTO functions (id, name, description, runtime, handler, code, code_path, 
			memory_mb, timeout_sec, environment, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`

	_, err = ps.db.Exec(query,
		fn.ID, fn.Name, fn.Description, fn.Runtime, fn.Handler, fn.Code, fn.CodePath,
		fn.MemoryMB, fn.TimeoutSec, envJSON, fn.CreatedAt, fn.UpdatedAt,
	)

	if err != nil {
		if isUniqueViolation(err) {
			return ErrAlreadyExists
		}
		return fmt.Errorf("failed to create function: %w", err)
	}

	return nil
}

// Get retrieves a function by name
func (ps *PostgresStorage) Get(name string) (*models.Function, error) {
	query := `
		SELECT id, name, description, runtime, handler, code, code_path,
			memory_mb, timeout_sec, environment, created_at, updated_at
		FROM functions
		WHERE name = $1
	`

	fn := &models.Function{}
	var envJSON []byte

	err := ps.db.QueryRow(query, name).Scan(
		&fn.ID, &fn.Name, &fn.Description, &fn.Runtime, &fn.Handler, &fn.Code, &fn.CodePath,
		&fn.MemoryMB, &fn.TimeoutSec, &envJSON, &fn.CreatedAt, &fn.UpdatedAt,
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get function: %w", err)
	}

	if len(envJSON) > 0 && string(envJSON) != "null" {
		if err := json.Unmarshal(envJSON, &fn.Environment); err != nil {
			return nil, fmt.Errorf("failed to unmarshal environment: %w", err)
		}
	}

	return fn, nil
}

// GetByID retrieves a function by ID
func (ps *PostgresStorage) GetByID(id string) (*models.Function, error) {
	query := `
		SELECT id, name, description, runtime, handler, code, code_path,
			memory_mb, timeout_sec, environment, created_at, updated_at
		FROM functions
		WHERE id = $1
	`

	fn := &models.Function{}
	var envJSON []byte

	err := ps.db.QueryRow(query, id).Scan(
		&fn.ID, &fn.Name, &fn.Description, &fn.Runtime, &fn.Handler, &fn.Code, &fn.CodePath,
		&fn.MemoryMB, &fn.TimeoutSec, &envJSON, &fn.CreatedAt, &fn.UpdatedAt,
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get function by ID: %w", err)
	}

	if len(envJSON) > 0 && string(envJSON) != "null" {
		if err := json.Unmarshal(envJSON, &fn.Environment); err != nil {
			return nil, fmt.Errorf("failed to unmarshal environment: %w", err)
		}
	}

	return fn, nil
}

// Update updates an existing function
func (ps *PostgresStorage) Update(fn *models.Function) error {
	envJSON, err := json.Marshal(fn.Environment)
	if err != nil {
		return fmt.Errorf("failed to marshal environment: %w", err)
	}

	query := `
		UPDATE functions
		SET description = $1, runtime = $2, handler = $3, code = $4, code_path = $5,
			memory_mb = $6, timeout_sec = $7, environment = $8, updated_at = $9
		WHERE name = $10
	`

	result, err := ps.db.Exec(query,
		fn.Description, fn.Runtime, fn.Handler, fn.Code, fn.CodePath,
		fn.MemoryMB, fn.TimeoutSec, envJSON, fn.UpdatedAt, fn.Name,
	)

	if err != nil {
		return fmt.Errorf("failed to update function: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rows == 0 {
		return ErrNotFound
	}

	return nil
}

// Delete deletes a function
func (ps *PostgresStorage) Delete(name string) error {
	query := `DELETE FROM functions WHERE name = $1`

	result, err := ps.db.Exec(query, name)
	if err != nil {
		return fmt.Errorf("failed to delete function: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rows == 0 {
		return ErrNotFound
	}

	return nil
}

// List returns all functions
func (ps *PostgresStorage) List() ([]*models.Function, error) {
	query := `
		SELECT id, name, description, runtime, handler, code, code_path,
			memory_mb, timeout_sec, environment, created_at, updated_at
		FROM functions
		ORDER BY created_at DESC
	`

	rows, err := ps.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to list functions: %w", err)
	}
	defer rows.Close()

	var functions []*models.Function

	for rows.Next() {
		fn := &models.Function{}
		var envJSON []byte

		err := rows.Scan(
			&fn.ID, &fn.Name, &fn.Description, &fn.Runtime, &fn.Handler, &fn.Code, &fn.CodePath,
			&fn.MemoryMB, &fn.TimeoutSec, &envJSON, &fn.CreatedAt, &fn.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan function: %w", err)
		}

		if len(envJSON) > 0 && string(envJSON) != "null" {
			if err := json.Unmarshal(envJSON, &fn.Environment); err != nil {
				return nil, fmt.Errorf("failed to unmarshal environment: %w", err)
			}
		}

		functions = append(functions, fn)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating functions: %w", err)
	}

	return functions, nil
}

// SaveCode saves function code (stored in database with function metadata)
func (ps *PostgresStorage) SaveCode(name string, code []byte) (string, error) {
	// For PostgreSQL, we store code in the database itself
	// This method updates the code field of the function
	query := `UPDATE functions SET code = $1 WHERE name = $2`

	result, err := ps.db.Exec(query, string(code), name)
	if err != nil {
		return "", fmt.Errorf("failed to save code: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return "", fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rows == 0 {
		return "", ErrNotFound
	}

	// Return a logical path (not filesystem)
	return fmt.Sprintf("db://functions/%s/code", name), nil
}

// GetCode retrieves function code
func (ps *PostgresStorage) GetCode(name string) ([]byte, error) {
	query := `SELECT code FROM functions WHERE name = $1`

	var code string
	err := ps.db.QueryRow(query, name).Scan(&code)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get code: %w", err)
	}

	return []byte(code), nil
}

// Close closes the database connection
func (ps *PostgresStorage) Close() error {
	return ps.db.Close()
}

// isUniqueViolation checks if the error is a unique constraint violation
func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	// PostgreSQL error code 23505 is unique_violation
	return err.Error() == "pq: duplicate key value violates unique constraint \"functions_name_key\""
}
