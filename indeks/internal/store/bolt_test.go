package store

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/oblak/indeks/internal/models"
)

func newBolt(t *testing.T) *BoltStore {
	t.Helper()
	dir := t.TempDir()
	st, err := NewBoltStore(filepath.Join(dir, "indeks.db"), filepath.Join(dir, "backups"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	return st
}

var ctx = context.Background()

func TestCreateAndGetTable(t *testing.T) {
	st := newBolt(t)
	_, err := st.CreateTable(ctx, "users", models.KeySchema{PartitionKey: "id", PartitionType: models.KeyTypeString})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if _, err := st.CreateTable(ctx, "users", models.KeySchema{PartitionKey: "id"}); err == nil {
		t.Error("expected a duplicate table to be refused")
	}
	tbl, err := st.GetTable(ctx, "users")
	if err != nil || tbl.Keys.PartitionKey != "id" {
		t.Fatalf("get: %v %+v", err, tbl)
	}
}

func TestPutGetDeleteItem(t *testing.T) {
	st := newBolt(t)
	st.CreateTable(ctx, "users", models.KeySchema{PartitionKey: "id", PartitionType: models.KeyTypeString})

	item := models.Item{"id": "u1", "name": "Ada", "age": float64(36)}
	if err := st.PutItem(ctx, "users", item); err != nil {
		t.Fatalf("put: %v", err)
	}
	got, err := st.GetItem(ctx, "users", "u1", nil)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got["name"] != "Ada" {
		t.Errorf("got %+v", got)
	}
	if err := st.DeleteItem(ctx, "users", "u1", nil); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := st.GetItem(ctx, "users", "u1", nil); err == nil {
		t.Error("expected the item to be gone")
	}
}

func TestPutRejectsMissingKey(t *testing.T) {
	st := newBolt(t)
	st.CreateTable(ctx, "users", models.KeySchema{PartitionKey: "id", PartitionType: models.KeyTypeString})
	err := st.PutItem(ctx, "users", models.Item{"name": "no key"})
	if err == nil {
		t.Fatal("expected a missing partition key to be rejected")
	}
}

func TestQueryByPartitionAndSortRange(t *testing.T) {
	st := newBolt(t)
	st.CreateTable(ctx, "events", models.KeySchema{
		PartitionKey: "device", PartitionType: models.KeyTypeString,
		SortKey: "ts", SortType: models.KeyTypeNumber,
	})
	// Two devices, several timestamps each.
	for _, ts := range []float64{100, 200, 300, 400} {
		st.PutItem(ctx, "events", models.Item{"device": "A", "ts": ts, "v": ts})
	}
	st.PutItem(ctx, "events", models.Item{"device": "B", "ts": float64(250), "v": float64(999)})

	// Query device A only.
	res, err := st.Query(ctx, "events", &models.QueryRequest{PartitionValue: "A"})
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	if res.Count != 4 {
		t.Fatalf("expected 4 items for device A, got %d", res.Count)
	}
	// Items must be in ascending sort-key (ts) order.
	if res.Items[0]["ts"].(float64) != 100 || res.Items[3]["ts"].(float64) != 400 {
		t.Errorf("items not in sort order: %+v", res.Items)
	}

	// Range: ts between 200 and 300 inclusive.
	res, _ = st.Query(ctx, "events", &models.QueryRequest{
		PartitionValue: "A",
		Sort:           &models.SortCondition{Op: models.SortBetween, Value: float64(200), Value2: float64(300)},
	})
	if res.Count != 2 {
		t.Fatalf("between 200..300 expected 2, got %d: %+v", res.Count, res.Items)
	}

	// gt 200 -> 300, 400
	res, _ = st.Query(ctx, "events", &models.QueryRequest{
		PartitionValue: "A",
		Sort:           &models.SortCondition{Op: models.SortGt, Value: float64(200)},
	})
	if res.Count != 2 || res.Items[0]["ts"].(float64) != 300 {
		t.Errorf("gt 200 wrong: %+v", res.Items)
	}

	// Descending order.
	res, _ = st.Query(ctx, "events", &models.QueryRequest{PartitionValue: "A", Descending: true})
	if res.Items[0]["ts"].(float64) != 400 {
		t.Errorf("descending should start at 400, got %+v", res.Items[0])
	}
}

// Numeric sort keys must order numerically, not lexically: 2 < 10 < 100.
func TestNumericSortKeyOrdersNumerically(t *testing.T) {
	st := newBolt(t)
	st.CreateTable(ctx, "n", models.KeySchema{
		PartitionKey: "p", PartitionType: models.KeyTypeString,
		SortKey: "k", SortType: models.KeyTypeNumber,
	})
	for _, k := range []float64{100, 2, 10, 1, 20} {
		st.PutItem(ctx, "n", models.Item{"p": "x", "k": k})
	}
	res, _ := st.Query(ctx, "n", &models.QueryRequest{PartitionValue: "x"})
	want := []float64{1, 2, 10, 20, 100}
	for i, w := range want {
		if got := res.Items[i]["k"].(float64); got != w {
			t.Errorf("position %d: got %v want %v (full: %+v)", i, got, w, res.Items)
		}
	}
}

func TestBeginsWith(t *testing.T) {
	st := newBolt(t)
	st.CreateTable(ctx, "t", models.KeySchema{
		PartitionKey: "p", PartitionType: models.KeyTypeString,
		SortKey: "name", SortType: models.KeyTypeString,
	})
	for _, n := range []string{"apple", "apricot", "banana", "avocado"} {
		st.PutItem(ctx, "t", models.Item{"p": "fruit", "name": n})
	}
	res, _ := st.Query(ctx, "t", &models.QueryRequest{
		PartitionValue: "fruit",
		Sort:           &models.SortCondition{Op: models.SortPrefix, Value: "ap"},
	})
	if res.Count != 2 {
		t.Fatalf("begins_with ap expected 2 (apple, apricot), got %d: %+v", res.Count, res.Items)
	}
}

func TestScanAndDeleteTable(t *testing.T) {
	st := newBolt(t)
	st.CreateTable(ctx, "t", models.KeySchema{PartitionKey: "id", PartitionType: models.KeyTypeString})
	for _, id := range []string{"a", "b", "c"} {
		st.PutItem(ctx, "t", models.Item{"id": id})
	}
	res, _ := st.Scan(ctx, "t", 0)
	if res.Count != 3 {
		t.Fatalf("scan expected 3, got %d", res.Count)
	}
	if err := st.DeleteTable(ctx, "t"); err != nil {
		t.Fatalf("delete table: %v", err)
	}
	if _, err := st.Scan(ctx, "t", 0); err == nil {
		t.Error("expected scan of a deleted table to fail")
	}
}

func TestBackupRestoreRoundTrip(t *testing.T) {
	st := newBolt(t)
	st.CreateTable(ctx, "orders", models.KeySchema{PartitionKey: "id", PartitionType: models.KeyTypeString})
	for _, id := range []string{"o1", "o2", "o3"} {
		st.PutItem(ctx, "orders", models.Item{"id": id, "total": float64(10)})
	}

	backup, err := st.CreateBackup(ctx, "orders")
	if err != nil {
		t.Fatalf("backup: %v", err)
	}
	if backup.ItemCount != 3 {
		t.Errorf("backup item count = %d, want 3", backup.ItemCount)
	}

	// Destroy data, then restore.
	st.DeleteItem(ctx, "orders", "o1", nil)
	st.DeleteItem(ctx, "orders", "o2", nil)
	if _, err := st.RestoreBackup(ctx, backup.ID, ""); err != nil {
		t.Fatalf("restore: %v", err)
	}
	res, _ := st.Scan(ctx, "orders", 0)
	if res.Count != 3 {
		t.Fatalf("after restore expected 3 items, got %d", res.Count)
	}

	// Backups survive table deletion and list by table.
	st.DeleteTable(ctx, "orders")
	list, _ := st.ListBackups(ctx, "orders")
	if len(list) != 1 {
		t.Errorf("expected the backup to outlive the table, got %d", len(list))
	}
}

func TestBackupPersistsAcrossReopen(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "indeks.db")
	bdir := filepath.Join(dir, "backups")

	st, _ := NewBoltStore(path, bdir)
	st.CreateTable(ctx, "t", models.KeySchema{PartitionKey: "id", PartitionType: models.KeyTypeString})
	st.PutItem(ctx, "t", models.Item{"id": "a"})
	st.Close()

	reopened, err := NewBoltStore(path, bdir)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer reopened.Close()
	got, err := reopened.GetItem(ctx, "t", "a", nil)
	if err != nil || got["id"] != "a" {
		t.Errorf("data did not survive reopen: %v %+v", err, got)
	}
}
