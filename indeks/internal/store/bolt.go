package store

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	bolt "go.etcd.io/bbolt"

	"github.com/oblak/indeks/internal/models"
)

// BoltStore persists tables and items in a single embedded bbolt file.
//
// bbolt is chosen for the same reason Tefter uses stock database images and
// Pristaniste uses a stock registry: it makes Indeks fully self-hostable with no
// external dependency. It is a transactional B+tree with byte-ordered keys,
// which maps cleanly onto DynamoDB's model: each table is a bucket, and an item
// is stored under a composite key of its encoded partition and sort values, so
// items in a partition are already in sort order and a range query is a cursor
// seek rather than a scan.
type BoltStore struct {
	db        *bolt.DB
	backupDir string
}

// Layout inside the bolt file:
//
//	__schemas__            bucket: table name -> KeySchema JSON
//	t:<table>              bucket per table: itemKey -> item JSON
//
// itemKey is  <encoded-partition> 0x00 <encoded-sort>  so the NUL separator
// keeps one partition's items contiguous and ordered by sort key.
const (
	schemasBucket = "__schemas__"
	tablePrefix   = "t:"
	keySep        = 0x00
)

// NewBoltStore opens (or creates) the store at path, with backups written to
// backupDir.
func NewBoltStore(path, backupDir string) (*BoltStore, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}
	if err := os.MkdirAll(backupDir, 0o750); err != nil {
		return nil, fmt.Errorf("create backup dir: %w", err)
	}

	db, err := bolt.Open(path, 0o640, &bolt.Options{Timeout: 5 * time.Second})
	if err != nil {
		return nil, fmt.Errorf("open bolt db: %w", err)
	}

	if err := db.Update(func(tx *bolt.Tx) error {
		_, err := tx.CreateBucketIfNotExists([]byte(schemasBucket))
		return err
	}); err != nil {
		db.Close()
		return nil, fmt.Errorf("init schema bucket: %w", err)
	}

	return &BoltStore{db: db, backupDir: backupDir}, nil
}

func (s *BoltStore) Close() error { return s.db.Close() }

func (s *BoltStore) Health(ctx context.Context) error {
	// A read transaction confirms the file is open and consistent.
	return s.db.View(func(tx *bolt.Tx) error {
		if tx.Bucket([]byte(schemasBucket)) == nil {
			return fmt.Errorf("schema bucket missing")
		}
		return nil
	})
}

// =============================================================================
// Tables
// =============================================================================

func tableBucketName(name string) []byte { return []byte(tablePrefix + name) }

func (s *BoltStore) loadSchema(tx *bolt.Tx, name string) (*models.KeySchema, error) {
	raw := tx.Bucket([]byte(schemasBucket)).Get([]byte(name))
	if raw == nil {
		return nil, fmt.Errorf("%w: table %s", models.ErrNotFound, name)
	}
	var schema models.KeySchema
	if err := json.Unmarshal(raw, &schema); err != nil {
		return nil, fmt.Errorf("decode schema for %s: %w", name, err)
	}
	return &schema, nil
}

func (s *BoltStore) CreateTable(ctx context.Context, name string, keys models.KeySchema) (*models.Table, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	err := s.db.Update(func(tx *bolt.Tx) error {
		schemas := tx.Bucket([]byte(schemasBucket))
		if schemas.Get([]byte(name)) != nil {
			return fmt.Errorf("%w: table %s", models.ErrAlreadyExists, name)
		}
		if _, err := tx.CreateBucketIfNotExists(tableBucketName(name)); err != nil {
			return err
		}
		meta := struct {
			models.KeySchema
			CreatedAt string `json:"created_at"`
		}{keys, now}
		raw, err := json.Marshal(meta)
		if err != nil {
			return err
		}
		return schemas.Put([]byte(name), raw)
	})
	if err != nil {
		return nil, err
	}
	return &models.Table{Name: name, Keys: keys, CreatedAt: now}, nil
}

func (s *BoltStore) GetTable(ctx context.Context, name string) (*models.Table, error) {
	var table *models.Table
	err := s.db.View(func(tx *bolt.Tx) error {
		raw := tx.Bucket([]byte(schemasBucket)).Get([]byte(name))
		if raw == nil {
			return fmt.Errorf("%w: table %s", models.ErrNotFound, name)
		}
		var meta struct {
			models.KeySchema
			CreatedAt string `json:"created_at"`
		}
		if err := json.Unmarshal(raw, &meta); err != nil {
			return err
		}
		count, size := tableStats(tx, name)
		table = &models.Table{
			Name:      name,
			Keys:      meta.KeySchema,
			CreatedAt: meta.CreatedAt,
			ItemCount: count,
			SizeBytes: size,
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return table, nil
}

func tableStats(tx *bolt.Tx, name string) (count, size int64) {
	b := tx.Bucket(tableBucketName(name))
	if b == nil {
		return 0, 0
	}
	c := b.Cursor()
	for k, v := c.First(); k != nil; k, v = c.Next() {
		count++
		size += int64(len(k) + len(v))
	}
	return count, size
}

func (s *BoltStore) ListTables(ctx context.Context) ([]models.Table, error) {
	var out []models.Table
	err := s.db.View(func(tx *bolt.Tx) error {
		schemas := tx.Bucket([]byte(schemasBucket))
		return schemas.ForEach(func(name, raw []byte) error {
			var meta struct {
				models.KeySchema
				CreatedAt string `json:"created_at"`
			}
			if err := json.Unmarshal(raw, &meta); err != nil {
				return err
			}
			count, size := tableStats(tx, string(name))
			out = append(out, models.Table{
				Name:      string(name),
				Keys:      meta.KeySchema,
				CreatedAt: meta.CreatedAt,
				ItemCount: count,
				SizeBytes: size,
			})
			return nil
		})
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

func (s *BoltStore) DeleteTable(ctx context.Context, name string) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		schemas := tx.Bucket([]byte(schemasBucket))
		if schemas.Get([]byte(name)) == nil {
			return fmt.Errorf("%w: table %s", models.ErrNotFound, name)
		}
		if err := schemas.Delete([]byte(name)); err != nil {
			return err
		}
		if tx.Bucket(tableBucketName(name)) != nil {
			return tx.DeleteBucket(tableBucketName(name))
		}
		return nil
	})
}

// =============================================================================
// Items
// =============================================================================

// itemKey builds the composite storage key for an item.
func itemKey(partition, sort string) []byte {
	buf := make([]byte, 0, len(partition)+1+len(sort))
	buf = append(buf, partition...)
	buf = append(buf, keySep)
	buf = append(buf, sort...)
	return buf
}

func (s *BoltStore) PutItem(ctx context.Context, table string, item models.Item) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		schema, err := s.loadSchema(tx, table)
		if err != nil {
			return err
		}
		partition, sortVal, err := schema.ExtractKey(item)
		if err != nil {
			return err
		}
		raw, err := json.Marshal(item)
		if err != nil {
			return fmt.Errorf("encode item: %w", err)
		}
		return tx.Bucket(tableBucketName(table)).Put(itemKey(partition, sortVal), raw)
	})
}

func (s *BoltStore) GetItem(ctx context.Context, table string, partition, sortRaw interface{}) (models.Item, error) {
	var item models.Item
	err := s.db.View(func(tx *bolt.Tx) error {
		schema, err := s.loadSchema(tx, table)
		if err != nil {
			return err
		}
		p, sVal, err := encodeLookup(schema, partition, sortRaw)
		if err != nil {
			return err
		}
		raw := tx.Bucket(tableBucketName(table)).Get(itemKey(p, sVal))
		if raw == nil {
			return fmt.Errorf("%w: item", models.ErrNotFound)
		}
		return json.Unmarshal(raw, &item)
	})
	if err != nil {
		return nil, err
	}
	return item, nil
}

func (s *BoltStore) DeleteItem(ctx context.Context, table string, partition, sortRaw interface{}) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		schema, err := s.loadSchema(tx, table)
		if err != nil {
			return err
		}
		p, sVal, err := encodeLookup(schema, partition, sortRaw)
		if err != nil {
			return err
		}
		b := tx.Bucket(tableBucketName(table))
		key := itemKey(p, sVal)
		if b.Get(key) == nil {
			return fmt.Errorf("%w: item", models.ErrNotFound)
		}
		return b.Delete(key)
	})
}

// encodeLookup validates and encodes a partition (and optional sort) for a
// point lookup, rejecting a missing sort key on a composite-key table.
func encodeLookup(schema *models.KeySchema, partition, sortRaw interface{}) (string, string, error) {
	p, err := schema.EncodePartition(partition)
	if err != nil {
		return "", "", &models.ValidationError{Field: schema.PartitionKey, Message: err.Error()}
	}
	if !schema.HasSortKey() {
		return p, "", nil
	}
	if sortRaw == nil {
		return "", "", &models.ValidationError{Field: schema.SortKey, Message: "this table has a sort key, so a sort value is required"}
	}
	sVal, err := schema.EncodeSort(sortRaw)
	if err != nil {
		return "", "", &models.ValidationError{Field: schema.SortKey, Message: err.Error()}
	}
	return p, sVal, nil
}

const defaultLimit = 100
const maxLimit = 1000

func (s *BoltStore) Query(ctx context.Context, table string, req *models.QueryRequest) (*QueryResult, error) {
	result := &QueryResult{Items: []models.Item{}}
	limit := clampLimit(req.Limit)

	err := s.db.View(func(tx *bolt.Tx) error {
		schema, err := s.loadSchema(tx, table)
		if err != nil {
			return err
		}
		partition, err := schema.EncodePartition(req.PartitionValue)
		if err != nil {
			return &models.ValidationError{Field: schema.PartitionKey, Message: err.Error()}
		}

		// Every item in the partition shares this prefix: <partition> 0x00 ...
		prefix := append([]byte(partition), keySep)

		// Encode the sort condition bounds, if any.
		var lo, hi []byte
		var prefixMatch []byte
		if req.Sort != nil && schema.HasSortKey() {
			lo, hi, prefixMatch, err = encodeSortCondition(schema, req.Sort)
			if err != nil {
				return err
			}
		}

		matches := collectPartition(tx, table, prefix, lo, hi, prefixMatch, req.Descending, limit)
		for _, raw := range matches {
			var item models.Item
			if err := json.Unmarshal(raw, &item); err != nil {
				return err
			}
			result.Items = append(result.Items, item)
		}
		result.Count = len(result.Items)
		result.ScannedCount = result.Count
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// collectPartition walks one partition's items applying an optional sort-key
// bound, honouring direction and limit. Returns raw item bytes.
func collectPartition(tx *bolt.Tx, table string, prefix, lo, hi, prefixMatch []byte, desc bool, limit int) [][]byte {
	b := tx.Bucket(tableBucketName(table))
	if b == nil {
		return nil
	}
	c := b.Cursor()

	// Gather matching keys in ascending order first, then reverse if needed.
	var out [][]byte
	for k, v := c.Seek(prefix); k != nil && bytes.HasPrefix(k, prefix); k, v = c.Next() {
		sortPart := k[len(prefix):]
		if lo != nil && bytes.Compare(sortPart, lo) < 0 {
			continue
		}
		if hi != nil && bytes.Compare(sortPart, hi) > 0 {
			continue
		}
		if prefixMatch != nil && !bytes.HasPrefix(sortPart, prefixMatch) {
			continue
		}
		// Copy: bbolt reuses the value slice across iterations.
		vc := make([]byte, len(v))
		copy(vc, v)
		out = append(out, vc)
	}

	if desc {
		for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
			out[i], out[j] = out[j], out[i]
		}
	}
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out
}

// encodeSortCondition turns a sort condition into byte-range bounds. Exactly one
// of (lo/hi range) or prefixMatch is used.
func encodeSortCondition(schema *models.KeySchema, cond *models.SortCondition) (lo, hi, prefixMatch []byte, err error) {
	enc := func(v interface{}) ([]byte, error) {
		s, e := schema.EncodeSort(v)
		if e != nil {
			return nil, &models.ValidationError{Field: schema.SortKey, Message: e.Error()}
		}
		return []byte(s), nil
	}

	switch cond.Op {
	case models.SortEq:
		v, e := enc(cond.Value)
		if e != nil {
			return nil, nil, nil, e
		}
		return v, v, nil, nil
	case models.SortLt:
		v, e := enc(cond.Value)
		if e != nil {
			return nil, nil, nil, e
		}
		return nil, decrement(v), nil, nil
	case models.SortLte:
		v, e := enc(cond.Value)
		if e != nil {
			return nil, nil, nil, e
		}
		return nil, v, nil, nil
	case models.SortGt:
		v, e := enc(cond.Value)
		if e != nil {
			return nil, nil, nil, e
		}
		return append(v, 0x00), nil, nil, nil
	case models.SortGte:
		v, e := enc(cond.Value)
		if e != nil {
			return nil, nil, nil, e
		}
		return v, nil, nil, nil
	case models.SortBetween:
		v1, e := enc(cond.Value)
		if e != nil {
			return nil, nil, nil, e
		}
		v2, e := enc(cond.Value2)
		if e != nil {
			return nil, nil, nil, e
		}
		return v1, v2, nil, nil
	case models.SortPrefix:
		// begins_with only makes sense for string sort keys.
		if schema.SortType != models.KeyTypeString {
			return nil, nil, nil, &models.ValidationError{Field: "sort", Message: "begins_with is only valid for a string sort key"}
		}
		p, ok := cond.Value.(string)
		if !ok {
			return nil, nil, nil, &models.ValidationError{Field: "sort", Message: "begins_with needs a string value"}
		}
		return nil, nil, []byte(p), nil
	}
	return nil, nil, nil, &models.ValidationError{Field: "sort", Message: fmt.Sprintf("unknown sort operator %q", cond.Op)}
}

// decrement returns the largest byte string strictly less than v, for exclusive
// upper bounds. Trimming the last byte is sufficient for our comparison use.
func decrement(v []byte) []byte {
	if len(v) == 0 {
		return v
	}
	out := make([]byte, len(v))
	copy(out, v)
	// Find the last non-zero byte and subtract one; drop trailing to make it
	// strictly smaller than any key equal to v.
	for i := len(out) - 1; i >= 0; i-- {
		if out[i] > 0 {
			out[i]--
			return out[:i+1]
		}
	}
	return []byte{}
}

func (s *BoltStore) Scan(ctx context.Context, table string, limit int) (*QueryResult, error) {
	result := &QueryResult{Items: []models.Item{}}
	lim := clampLimit(limit)
	err := s.db.View(func(tx *bolt.Tx) error {
		if _, err := s.loadSchema(tx, table); err != nil {
			return err
		}
		b := tx.Bucket(tableBucketName(table))
		c := b.Cursor()
		for k, v := c.First(); k != nil; k, v = c.Next() {
			result.ScannedCount++
			if len(result.Items) >= lim {
				continue
			}
			var item models.Item
			if err := json.Unmarshal(v, &item); err != nil {
				return err
			}
			result.Items = append(result.Items, item)
		}
		result.Count = len(result.Items)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

func clampLimit(n int) int {
	if n <= 0 {
		return defaultLimit
	}
	if n > maxLimit {
		return maxLimit
	}
	return n
}

// =============================================================================
// Backups
// =============================================================================

func (s *BoltStore) backupPath(id string) string {
	return filepath.Join(s.backupDir, id+".json")
}

func (s *BoltStore) CreateBackup(ctx context.Context, table string) (*models.Backup, error) {
	now := time.Now().UTC()
	id := models.NewBackupID(table, now)

	file := models.BackupFile{
		Backup: models.Backup{ID: id, Table: table, CreatedAt: now.Format(time.RFC3339)},
		Items:  []models.Item{},
	}

	err := s.db.View(func(tx *bolt.Tx) error {
		schema, err := s.loadSchema(tx, table)
		if err != nil {
			return err
		}
		file.Keys = *schema
		b := tx.Bucket(tableBucketName(table))
		c := b.Cursor()
		for k, v := c.First(); k != nil; k, v = c.Next() {
			var item models.Item
			if err := json.Unmarshal(v, &item); err != nil {
				return err
			}
			file.Items = append(file.Items, item)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	file.Backup.ItemCount = int64(len(file.Items))

	raw, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encode backup: %w", err)
	}
	file.Backup.SizeBytes = int64(len(raw))

	path := s.backupPath(id)
	if _, err := os.Stat(path); err == nil {
		return nil, fmt.Errorf("%w: backup %s", models.ErrAlreadyExists, id)
	}
	// Re-encode with the size filled in, then write atomically.
	raw, _ = json.MarshalIndent(file, "", "  ")
	tmp := path + ".partial"
	if err := os.WriteFile(tmp, raw, 0o640); err != nil {
		return nil, fmt.Errorf("write backup: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		return nil, fmt.Errorf("finalise backup: %w", err)
	}
	return &file.Backup, nil
}

func (s *BoltStore) readBackup(id string) (*models.BackupFile, error) {
	if !models.IsValidBackupID(id) {
		return nil, &models.ValidationError{Field: "backup_id", Message: "malformed backup id"}
	}
	raw, err := os.ReadFile(s.backupPath(id))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("%w: backup %s", models.ErrNotFound, id)
		}
		return nil, err
	}
	var file models.BackupFile
	if err := json.Unmarshal(raw, &file); err != nil {
		return nil, fmt.Errorf("decode backup: %w", err)
	}
	return &file, nil
}

func (s *BoltStore) GetBackup(ctx context.Context, id string) (*models.Backup, error) {
	file, err := s.readBackup(id)
	if err != nil {
		return nil, err
	}
	return &file.Backup, nil
}

func (s *BoltStore) ListBackups(ctx context.Context, table string) ([]models.Backup, error) {
	entries, err := os.ReadDir(s.backupDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []models.Backup{}, nil
		}
		return nil, err
	}
	out := make([]models.Backup, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		id := strings.TrimSuffix(e.Name(), ".json")
		file, err := s.readBackup(id)
		if err != nil {
			continue
		}
		if table != "" && file.Backup.Table != table {
			continue
		}
		out = append(out, file.Backup)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt > out[j].CreatedAt })
	return out, nil
}

func (s *BoltStore) DeleteBackup(ctx context.Context, id string) error {
	if !models.IsValidBackupID(id) {
		return &models.ValidationError{Field: "backup_id", Message: "malformed backup id"}
	}
	if err := os.Remove(s.backupPath(id)); err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("%w: backup %s", models.ErrNotFound, id)
		}
		return err
	}
	return nil
}

func (s *BoltStore) RestoreBackup(ctx context.Context, id, targetTable string) (*models.Table, error) {
	file, err := s.readBackup(id)
	if err != nil {
		return nil, err
	}
	table := targetTable
	if table == "" {
		table = file.Backup.Table
	}

	err = s.db.Update(func(tx *bolt.Tx) error {
		schemas := tx.Bucket([]byte(schemasBucket))

		// Recreate the table bucket fresh so the restore replaces the contents
		// rather than merging into whatever is there.
		if tx.Bucket(tableBucketName(table)) != nil {
			if err := tx.DeleteBucket(tableBucketName(table)); err != nil {
				return err
			}
		}
		b, err := tx.CreateBucket(tableBucketName(table))
		if err != nil {
			return err
		}

		meta := struct {
			models.KeySchema
			CreatedAt string `json:"created_at"`
		}{file.Keys, time.Now().UTC().Format(time.RFC3339)}
		raw, err := json.Marshal(meta)
		if err != nil {
			return err
		}
		if err := schemas.Put([]byte(table), raw); err != nil {
			return err
		}

		for _, item := range file.Items {
			partition, sortVal, err := file.Keys.ExtractKey(item)
			if err != nil {
				return err
			}
			itemRaw, err := json.Marshal(item)
			if err != nil {
				return err
			}
			if err := b.Put(itemKey(partition, sortVal), itemRaw); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.GetTable(ctx, table)
}
