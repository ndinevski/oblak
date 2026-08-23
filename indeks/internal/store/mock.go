package store

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/oblak/indeks/internal/models"
)

// MockStore is an in-memory Store for tests. It mirrors BoltStore's behaviour
// closely enough that the API tests exercise real logic: composite keys,
// ordering, and the same error sentinels.
type MockStore struct {
	mu      sync.RWMutex
	tables  map[string]*mockTable
	backups map[string]*models.BackupFile

	// ShouldFail makes every call return FailMessage, to test error handling.
	ShouldFail  bool
	FailMessage string
}

type mockTable struct {
	schema    models.KeySchema
	createdAt string
	items     map[string]models.Item // itemKey -> item
}

// NewMockStore returns an empty mock.
func NewMockStore() *MockStore {
	return &MockStore{
		tables:      make(map[string]*mockTable),
		backups:     make(map[string]*models.BackupFile),
		FailMessage: "mock store failure",
	}
}

func (m *MockStore) fail() error {
	if m.ShouldFail {
		return fmt.Errorf("%s", m.FailMessage)
	}
	return nil
}

func (m *MockStore) Close() error                     { return nil }
func (m *MockStore) Health(ctx context.Context) error { return m.fail() }

func (m *MockStore) CreateTable(ctx context.Context, name string, keys models.KeySchema) (*models.Table, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.tables[name]; ok {
		return nil, fmt.Errorf("%w: table %s", models.ErrAlreadyExists, name)
	}
	now := time.Now().UTC().Format(time.RFC3339)
	m.tables[name] = &mockTable{schema: keys, createdAt: now, items: map[string]models.Item{}}
	return &models.Table{Name: name, Keys: keys, CreatedAt: now}, nil
}

func (m *MockStore) GetTable(ctx context.Context, name string) (*models.Table, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	t, ok := m.tables[name]
	if !ok {
		return nil, fmt.Errorf("%w: table %s", models.ErrNotFound, name)
	}
	var size int64
	for k := range t.items {
		size += int64(len(k))
	}
	return &models.Table{
		Name: name, Keys: t.schema, CreatedAt: t.createdAt,
		ItemCount: int64(len(t.items)), SizeBytes: size,
	}, nil
}

func (m *MockStore) ListTables(ctx context.Context) ([]models.Table, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]models.Table, 0, len(m.tables))
	for name, t := range m.tables {
		out = append(out, models.Table{
			Name: name, Keys: t.schema, CreatedAt: t.createdAt, ItemCount: int64(len(t.items)),
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

func (m *MockStore) DeleteTable(ctx context.Context, name string) error {
	if err := m.fail(); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.tables[name]; !ok {
		return fmt.Errorf("%w: table %s", models.ErrNotFound, name)
	}
	delete(m.tables, name)
	return nil
}

func (m *MockStore) PutItem(ctx context.Context, table string, item models.Item) error {
	if err := m.fail(); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	t, ok := m.tables[table]
	if !ok {
		return fmt.Errorf("%w: table %s", models.ErrNotFound, table)
	}
	p, s, err := t.schema.ExtractKey(item)
	if err != nil {
		return err
	}
	t.items[string(itemKey(p, s))] = item
	return nil
}

func (m *MockStore) GetItem(ctx context.Context, table string, partition, sortRaw interface{}) (models.Item, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	t, ok := m.tables[table]
	if !ok {
		return nil, fmt.Errorf("%w: table %s", models.ErrNotFound, table)
	}
	p, s, err := encodeLookup(&t.schema, partition, sortRaw)
	if err != nil {
		return nil, err
	}
	item, ok := t.items[string(itemKey(p, s))]
	if !ok {
		return nil, fmt.Errorf("%w: item", models.ErrNotFound)
	}
	return item, nil
}

func (m *MockStore) DeleteItem(ctx context.Context, table string, partition, sortRaw interface{}) error {
	if err := m.fail(); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	t, ok := m.tables[table]
	if !ok {
		return fmt.Errorf("%w: table %s", models.ErrNotFound, table)
	}
	p, s, err := encodeLookup(&t.schema, partition, sortRaw)
	if err != nil {
		return err
	}
	key := string(itemKey(p, s))
	if _, ok := t.items[key]; !ok {
		return fmt.Errorf("%w: item", models.ErrNotFound)
	}
	delete(t.items, key)
	return nil
}

func (m *MockStore) Query(ctx context.Context, table string, req *models.QueryRequest) (*QueryResult, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	t, ok := m.tables[table]
	if !ok {
		return nil, fmt.Errorf("%w: table %s", models.ErrNotFound, table)
	}
	partition, err := t.schema.EncodePartition(req.PartitionValue)
	if err != nil {
		return nil, &models.ValidationError{Field: t.schema.PartitionKey, Message: err.Error()}
	}
	prefix := partition + string(rune(keySep))

	// Collect the partition's keys in sorted order.
	var keys []string
	for k := range t.items {
		if strings.HasPrefix(k, prefix) {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	if req.Descending {
		for i, j := 0, len(keys)-1; i < j; i, j = i+1, j-1 {
			keys[i], keys[j] = keys[j], keys[i]
		}
	}

	result := &QueryResult{Items: []models.Item{}}
	limit := clampLimit(req.Limit)
	for _, k := range keys {
		if len(result.Items) >= limit {
			break
		}
		result.Items = append(result.Items, t.items[k])
	}
	result.Count = len(result.Items)
	result.ScannedCount = result.Count
	return result, nil
}

func (m *MockStore) Scan(ctx context.Context, table string, limit int) (*QueryResult, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	t, ok := m.tables[table]
	if !ok {
		return nil, fmt.Errorf("%w: table %s", models.ErrNotFound, table)
	}
	var keys []string
	for k := range t.items {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	result := &QueryResult{Items: []models.Item{}}
	lim := clampLimit(limit)
	for _, k := range keys {
		result.ScannedCount++
		if len(result.Items) < lim {
			result.Items = append(result.Items, t.items[k])
		}
	}
	result.Count = len(result.Items)
	return result, nil
}

func (m *MockStore) CreateBackup(ctx context.Context, table string) (*models.Backup, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	t, ok := m.tables[table]
	if !ok {
		return nil, fmt.Errorf("%w: table %s", models.ErrNotFound, table)
	}
	now := time.Now().UTC()
	id := models.NewBackupID(table, now)
	file := &models.BackupFile{
		Backup: models.Backup{ID: id, Table: table, CreatedAt: now.Format(time.RFC3339)},
		Keys:   t.schema,
		Items:  []models.Item{},
	}
	for _, item := range t.items {
		file.Items = append(file.Items, item)
	}
	file.Backup.ItemCount = int64(len(file.Items))
	m.backups[id] = file
	return &file.Backup, nil
}

func (m *MockStore) ListBackups(ctx context.Context, table string) ([]models.Backup, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]models.Backup, 0, len(m.backups))
	for _, f := range m.backups {
		if table != "" && f.Backup.Table != table {
			continue
		}
		out = append(out, f.Backup)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt > out[j].CreatedAt })
	return out, nil
}

func (m *MockStore) GetBackup(ctx context.Context, id string) (*models.Backup, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	f, ok := m.backups[id]
	if !ok {
		return nil, fmt.Errorf("%w: backup %s", models.ErrNotFound, id)
	}
	return &f.Backup, nil
}

func (m *MockStore) DeleteBackup(ctx context.Context, id string) error {
	if err := m.fail(); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.backups[id]; !ok {
		return fmt.Errorf("%w: backup %s", models.ErrNotFound, id)
	}
	delete(m.backups, id)
	return nil
}

func (m *MockStore) RestoreBackup(ctx context.Context, id, targetTable string) (*models.Table, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	f, ok := m.backups[id]
	if !ok {
		return nil, fmt.Errorf("%w: backup %s", models.ErrNotFound, id)
	}
	table := targetTable
	if table == "" {
		table = f.Backup.Table
	}
	now := time.Now().UTC().Format(time.RFC3339)
	t := &mockTable{schema: f.Keys, createdAt: now, items: map[string]models.Item{}}
	for _, item := range f.Items {
		p, s, err := f.Keys.ExtractKey(item)
		if err != nil {
			return nil, err
		}
		t.items[string(itemKey(p, s))] = item
	}
	m.tables[table] = t
	return &models.Table{Name: table, Keys: f.Keys, CreatedAt: now, ItemCount: int64(len(t.items))}, nil
}
