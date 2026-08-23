// Package store is the storage layer behind Indeks.
//
// Defined as an interface, like the other Oblak services, so the API can be
// tested without touching disk. BoltStore is the real embedded implementation;
// MockStore is the in-memory one the tests use.
package store

import (
	"context"

	"github.com/oblak/indeks/internal/models"
)

// QueryResult is a page of items from a query or scan.
type QueryResult struct {
	Items []models.Item `json:"items"`
	Count int           `json:"count"`
	// ScannedCount is how many items were examined; for a query it equals
	// Count, for a scan it can be larger.
	ScannedCount int `json:"scanned_count"`
}

// Store is everything Indeks needs from its storage layer.
type Store interface {
	// Health returns nil when the store is usable.
	Health(ctx context.Context) error

	// Tables
	ListTables(ctx context.Context) ([]models.Table, error)
	GetTable(ctx context.Context, name string) (*models.Table, error)
	CreateTable(ctx context.Context, name string, keys models.KeySchema) (*models.Table, error)
	DeleteTable(ctx context.Context, name string) error

	// Items
	PutItem(ctx context.Context, table string, item models.Item) error
	GetItem(ctx context.Context, table string, partition, sort interface{}) (models.Item, error)
	DeleteItem(ctx context.Context, table string, partition, sort interface{}) error
	Query(ctx context.Context, table string, req *models.QueryRequest) (*QueryResult, error)
	Scan(ctx context.Context, table string, limit int) (*QueryResult, error)

	// Backups
	CreateBackup(ctx context.Context, table string) (*models.Backup, error)
	ListBackups(ctx context.Context, table string) ([]models.Backup, error)
	GetBackup(ctx context.Context, id string) (*models.Backup, error)
	DeleteBackup(ctx context.Context, id string) error
	RestoreBackup(ctx context.Context, id, targetTable string) (*models.Table, error)

	// Close releases the underlying handles.
	Close() error
}

// Ensure the implementations satisfy the interface.
var (
	_ Store = (*BoltStore)(nil)
	_ Store = (*MockStore)(nil)
)
