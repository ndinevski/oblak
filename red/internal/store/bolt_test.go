package store

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/oblak/red/internal/models"
)

var ctx = context.Background()

func newBolt(t *testing.T) *BoltStore {
	t.Helper()
	dir := t.TempDir()
	st, err := NewBoltStore(filepath.Join(dir, "red.db"), filepath.Join(dir, "backups"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	return st
}

func mkQueue(t *testing.T, st Store, name string, visSec int) {
	t.Helper()
	q, err := (&models.CreateQueueRequest{Name: name, VisibilityTimeoutSeconds: visSec}).Validate()
	if err != nil {
		t.Fatalf("validate queue: %v", err)
	}
	if _, err := st.CreateQueue(ctx, q); err != nil {
		t.Fatalf("create queue: %v", err)
	}
}

func send(t *testing.T, st Store, queue, body string) {
	t.Helper()
	msg := &models.Message{ID: models.NewMessageID(), Body: body, EnqueuedAt: time.Now().UnixMilli()}
	if err := st.SendMessage(ctx, queue, msg, time.Now()); err != nil {
		t.Fatalf("send: %v", err)
	}
}

func TestSendReceiveDelete(t *testing.T) {
	st := newBolt(t)
	mkQueue(t, st, "jobs", 30)
	send(t, st, "jobs", "hello")

	now := time.Now()
	got, err := st.Receive(ctx, "jobs", 10, now, 0)
	if err != nil {
		t.Fatalf("receive: %v", err)
	}
	if len(got) != 1 || got[0].Body != "hello" {
		t.Fatalf("unexpected receive: %+v", got)
	}
	if got[0].ReceiptHandle == "" {
		t.Fatal("received message must carry a receipt handle")
	}
	if got[0].ReceiveCount != 1 {
		t.Errorf("receive count = %d, want 1", got[0].ReceiveCount)
	}

	// Immediately receiving again returns nothing: the message is in-flight.
	again, _ := st.Receive(ctx, "jobs", 10, now, 0)
	if len(again) != 0 {
		t.Errorf("an in-flight message must not be redelivered, got %d", len(again))
	}

	// Delete acks it.
	if err := st.Delete(ctx, "jobs", got[0].ReceiptHandle); err != nil {
		t.Fatalf("delete: %v", err)
	}
	stats, _ := st.Stats(ctx, "jobs")
	if stats.VisibleMessages != 0 || stats.InFlightMessages != 0 {
		t.Errorf("queue should be empty after delete, got %+v", stats)
	}
}

// The defining SQS behaviour: a received-but-not-deleted message reappears once
// its visibility timeout passes.
func TestVisibilityTimeoutRedelivers(t *testing.T) {
	st := newBolt(t)
	mkQueue(t, st, "jobs", 30)
	send(t, st, "jobs", "work")

	t0 := time.Now()
	got, _ := st.Receive(ctx, "jobs", 10, t0, 2*time.Second)
	if len(got) != 1 {
		t.Fatal("expected one message")
	}
	handle1 := got[0].ReceiptHandle

	// Before the timeout: still invisible, and the sweep releases nothing.
	st.ReleaseExpired(ctx, t0.Add(1*time.Second))
	if g, _ := st.Receive(ctx, "jobs", 10, t0.Add(1*time.Second), 0); len(g) != 0 {
		t.Error("message should still be invisible before its timeout")
	}

	// After the timeout: the sweep returns it to visible, and it is redelivered
	// with a bumped receive count and a fresh handle.
	released, _, _, _ := st.ReleaseExpired(ctx, t0.Add(3*time.Second))
	if released != 1 {
		t.Fatalf("expected 1 released, got %d", released)
	}
	got2, _ := st.Receive(ctx, "jobs", 10, t0.Add(3*time.Second), 0)
	if len(got2) != 1 {
		t.Fatal("message should be redelivered after the timeout")
	}
	if got2[0].ReceiveCount != 2 {
		t.Errorf("receive count = %d, want 2", got2[0].ReceiveCount)
	}
	if got2[0].ReceiptHandle == handle1 {
		t.Error("a redelivered message must get a fresh receipt handle")
	}

	// A delete with the stale first handle must not remove it.
	if err := st.Delete(ctx, "jobs", handle1); err == nil {
		t.Error("deleting with a stale receipt handle should fail")
	}
}

// After MaxReceiveCount failed receives, the message moves to the DLQ.
func TestDeadLettering(t *testing.T) {
	st := newBolt(t)
	mkQueue(t, st, "dlq", 30)
	q, _ := (&models.CreateQueueRequest{
		Name: "jobs", VisibilityTimeoutSeconds: 1, MaxReceiveCount: 2, DeadLetterQueue: "dlq",
	}).Validate()
	if _, err := st.CreateQueue(ctx, q); err != nil {
		t.Fatalf("create jobs: %v", err)
	}
	send(t, st, "jobs", "poison")

	now := time.Now()
	// Receive #1, let it time out.
	st.Receive(ctx, "jobs", 1, now, time.Second)
	now = now.Add(2 * time.Second)
	rel, dl, _, _ := st.ReleaseExpired(ctx, now)
	if rel != 1 || dl != 0 {
		t.Fatalf("after 1st timeout: released=%d dead=%d, want 1/0", rel, dl)
	}
	// Receive #2 (count reaches 2), let it time out -> dead-lettered.
	st.Receive(ctx, "jobs", 1, now, time.Second)
	now = now.Add(2 * time.Second)
	rel, dl, _, _ = st.ReleaseExpired(ctx, now)
	if dl != 1 {
		t.Fatalf("after 2nd timeout: expected 1 dead-lettered, got released=%d dead=%d", rel, dl)
	}

	// The message is gone from jobs and present in dlq.
	if s, _ := st.Stats(ctx, "jobs"); s.VisibleMessages != 0 || s.InFlightMessages != 0 {
		t.Errorf("jobs should be empty, got %+v", s)
	}
	dlqMsgs, _ := st.Receive(ctx, "dlq", 10, now, 0)
	if len(dlqMsgs) != 1 || dlqMsgs[0].Body != "poison" {
		t.Errorf("dead-letter queue should hold the poison message, got %+v", dlqMsgs)
	}
}

func TestDelaySeconds(t *testing.T) {
	st := newBolt(t)
	mkQueue(t, st, "jobs", 30)
	now := time.Now()
	msg := &models.Message{ID: models.NewMessageID(), Body: "later", EnqueuedAt: now.UnixMilli()}
	// Visible only 5s from now.
	st.SendMessage(ctx, "jobs", msg, now.Add(5*time.Second))

	if g, _ := st.Receive(ctx, "jobs", 10, now, 0); len(g) != 0 {
		t.Error("a delayed message must not be visible yet")
	}
	if g, _ := st.Receive(ctx, "jobs", 10, now.Add(6*time.Second), 0); len(g) != 1 {
		t.Error("a delayed message must be visible after its delay")
	}
}

func TestRetentionExpiry(t *testing.T) {
	st := newBolt(t)
	q, _ := (&models.CreateQueueRequest{Name: "jobs", MessageRetentionSeconds: 60}).Validate()
	st.CreateQueue(ctx, q)
	// Enqueue a message stamped 2 minutes ago.
	old := time.Now().Add(-2 * time.Minute)
	msg := &models.Message{ID: models.NewMessageID(), Body: "stale", EnqueuedAt: old.UnixMilli()}
	st.SendMessage(ctx, "jobs", msg, old)

	_, _, expired, _ := st.ReleaseExpired(ctx, time.Now())
	if expired != 1 {
		t.Fatalf("expected 1 expired message, got %d", expired)
	}
	if s, _ := st.Stats(ctx, "jobs"); s.VisibleMessages != 0 {
		t.Errorf("expired message should be gone, got %+v", s)
	}
}

func TestFifoOrder(t *testing.T) {
	st := newBolt(t)
	mkQueue(t, st, "jobs", 30)
	for _, b := range []string{"a", "b", "c"} {
		send(t, st, "jobs", b)
		time.Sleep(2 * time.Millisecond) // ensure distinct enqueue/visible times
	}
	got, _ := st.Receive(ctx, "jobs", 10, time.Now(), 0)
	if len(got) != 3 || got[0].Body != "a" || got[2].Body != "c" {
		t.Errorf("expected FIFO a,b,c, got %+v", bodies(got))
	}
}

func TestPurgeAndDeleteQueue(t *testing.T) {
	st := newBolt(t)
	mkQueue(t, st, "jobs", 30)
	send(t, st, "jobs", "x")
	send(t, st, "jobs", "y")
	n, _ := st.PurgeQueue(ctx, "jobs")
	if n != 2 {
		t.Errorf("purge returned %d, want 2", n)
	}
	if s, _ := st.Stats(ctx, "jobs"); s.VisibleMessages != 0 {
		t.Errorf("queue should be empty after purge")
	}
	if err := st.DeleteQueue(ctx, "jobs"); err != nil {
		t.Fatalf("delete queue: %v", err)
	}
}

func TestDeleteQueueRefusedWhenDLQTarget(t *testing.T) {
	st := newBolt(t)
	mkQueue(t, st, "dlq", 30)
	q, _ := (&models.CreateQueueRequest{Name: "jobs", MaxReceiveCount: 1, DeadLetterQueue: "dlq"}).Validate()
	st.CreateQueue(ctx, q)
	if err := st.DeleteQueue(ctx, "dlq"); err == nil {
		t.Error("deleting a queue that is a DLQ target must be refused")
	}
}

func TestBackupRestoreRoundTrip(t *testing.T) {
	st := newBolt(t)
	mkQueue(t, st, "jobs", 30)
	send(t, st, "jobs", "one")
	send(t, st, "jobs", "two")

	backup, err := st.CreateBackup(ctx, "jobs")
	if err != nil {
		t.Fatalf("backup: %v", err)
	}
	if backup.MessageCount != 2 {
		t.Errorf("backup message count = %d, want 2", backup.MessageCount)
	}

	st.PurgeQueue(ctx, "jobs")
	if _, err := st.RestoreBackup(ctx, backup.ID, ""); err != nil {
		t.Fatalf("restore: %v", err)
	}
	got, _ := st.Receive(ctx, "jobs", 10, time.Now(), 0)
	if len(got) != 2 {
		t.Fatalf("expected 2 restored messages, got %d", len(got))
	}

	// Backups outlive the queue.
	st.DeleteQueue(ctx, "jobs")
	if list, _ := st.ListBackups(ctx, "jobs"); len(list) != 1 {
		t.Errorf("backup should outlive the queue, got %d", len(list))
	}
}

func TestPersistenceAcrossReopen(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "red.db")
	bdir := filepath.Join(dir, "backups")
	st, _ := NewBoltStore(path, bdir)
	mkQueue(t, st, "jobs", 30)
	send(t, st, "jobs", "durable")
	st.Close()

	reopened, err := NewBoltStore(path, bdir)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer reopened.Close()
	got, _ := reopened.Receive(ctx, "jobs", 10, time.Now(), 0)
	if len(got) != 1 || got[0].Body != "durable" {
		t.Errorf("message did not survive reopen: %+v", got)
	}
}

func bodies(msgs []models.Message) []string {
	out := make([]string, len(msgs))
	for i, m := range msgs {
		out[i] = m.Body
	}
	return out
}

func TestUpdateQueue(t *testing.T) {
	st := newBolt(t)
	mkQueue(t, st, "jobs", 30)
	newVis := 90
	q, err := st.UpdateQueue(ctx, "jobs", &models.UpdateQueueRequest{VisibilityTimeoutSeconds: &newVis})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if q.VisibilityTimeoutSeconds != 90 {
		t.Errorf("visibility not updated: %d", q.VisibilityTimeoutSeconds)
	}
	// A DLQ policy pointing at a missing queue is refused.
	dlq := "nope"
	max := 3
	if _, err := st.UpdateQueue(ctx, "jobs", &models.UpdateQueueRequest{MaxReceiveCount: &max, DeadLetterQueue: &dlq}); err == nil {
		t.Error("expected a missing DLQ to be refused")
	}
}

func TestUpdateSubscription(t *testing.T) {
	st := newBolt(t)
	mkQueue(t, st, "jobs", 30)
	sub, _ := (&models.CreateSubscriptionRequest{Name: "s", Queue: "jobs", Function: "fn"}).Validate()
	st.CreateSubscription(ctx, sub)

	disabled := false
	updated, err := st.UpdateSubscription(ctx, "s", &models.UpdateSubscriptionRequest{Enabled: &disabled})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.Enabled {
		t.Error("subscription should be disabled")
	}
	bad := 99
	if _, err := st.UpdateSubscription(ctx, "s", &models.UpdateSubscriptionRequest{BatchSize: &bad}); err == nil {
		t.Error("expected an out-of-range batch size to be rejected")
	}
}
