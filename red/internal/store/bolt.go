package store

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	bolt "go.etcd.io/bbolt"

	"github.com/oblak/red/internal/models"
)

// BoltStore persists queues and messages in a single embedded bbolt file.
//
// Layout:
//
//	__queues__                     bucket: queue name -> Queue config JSON
//	q:<queue>:msgs                 bucket: message id -> storedMessage JSON
//	q:<queue>:index                bucket: ordered visibility index
//
// The index key is  <visibleAt millis, 8 bytes big-endian> <id>  so a cursor
// from the start yields messages in the order they become visible, and a
// received message is simply re-indexed at its visibility deadline. This makes
// "give me the next visible message" and "release everything whose deadline has
// passed" both cheap ordered scans rather than full-queue walks.
type BoltStore struct {
	db        *bolt.DB
	backupDir string
}

const (
	queuesBucket        = "__queues__"
	subscriptionsBucket = "__subscriptions__"
	msgsSuffix          = ":msgs"
	indexSuffix         = ":index"
	queuePrefix         = "q:"
)

// storedMessage is the on-disk record: the message plus its scheduling state.
type storedMessage struct {
	models.Message
	// VisibleAt is when the message is (or becomes) deliverable, unix millis.
	// For an in-flight message this is its visibility deadline.
	VisibleAt int64 `json:"visible_at"`
	// InFlight is true between a receive and either a delete or the deadline.
	InFlight bool `json:"in_flight"`
}

// NewBoltStore opens (or creates) the store.
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
		if _, err := tx.CreateBucketIfNotExists([]byte(queuesBucket)); err != nil {
			return err
		}
		_, err := tx.CreateBucketIfNotExists([]byte(subscriptionsBucket))
		return err
	}); err != nil {
		db.Close()
		return nil, fmt.Errorf("init buckets: %w", err)
	}
	return &BoltStore{db: db, backupDir: backupDir}, nil
}

func (s *BoltStore) Close() error { return s.db.Close() }

func (s *BoltStore) Health(ctx context.Context) error {
	return s.db.View(func(tx *bolt.Tx) error {
		if tx.Bucket([]byte(queuesBucket)) == nil {
			return fmt.Errorf("queues bucket missing")
		}
		return nil
	})
}

func msgsBucketName(q string) []byte  { return []byte(queuePrefix + q + msgsSuffix) }
func indexBucketName(q string) []byte { return []byte(queuePrefix + q + indexSuffix) }

// indexKey builds the ordered visibility-index key.
func indexKey(visibleAt int64, id string) []byte {
	buf := make([]byte, 8+len(id))
	binary.BigEndian.PutUint64(buf[:8], uint64(visibleAt))
	copy(buf[8:], id)
	return buf
}

// =============================================================================
// Queues
// =============================================================================

func (s *BoltStore) loadQueue(tx *bolt.Tx, name string) (*models.Queue, error) {
	raw := tx.Bucket([]byte(queuesBucket)).Get([]byte(name))
	if raw == nil {
		return nil, fmt.Errorf("%w: queue %s", models.ErrNotFound, name)
	}
	var q models.Queue
	if err := json.Unmarshal(raw, &q); err != nil {
		return nil, fmt.Errorf("decode queue %s: %w", name, err)
	}
	return &q, nil
}

func (s *BoltStore) CreateQueue(ctx context.Context, q *models.Queue) (*models.Queue, error) {
	q.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	err := s.db.Update(func(tx *bolt.Tx) error {
		queues := tx.Bucket([]byte(queuesBucket))
		if queues.Get([]byte(q.Name)) != nil {
			return fmt.Errorf("%w: queue %s", models.ErrAlreadyExists, q.Name)
		}
		// A configured dead-letter queue must exist, or a failed message would
		// have nowhere to go.
		if q.DeadLetterQueue != "" && queues.Get([]byte(q.DeadLetterQueue)) == nil {
			return &models.ValidationError{Field: "dead_letter_queue", Message: fmt.Sprintf("dead-letter queue %q does not exist", q.DeadLetterQueue)}
		}
		if _, err := tx.CreateBucketIfNotExists(msgsBucketName(q.Name)); err != nil {
			return err
		}
		if _, err := tx.CreateBucketIfNotExists(indexBucketName(q.Name)); err != nil {
			return err
		}
		raw, err := json.Marshal(q)
		if err != nil {
			return err
		}
		return queues.Put([]byte(q.Name), raw)
	})
	if err != nil {
		return nil, err
	}
	return q, nil
}

func (s *BoltStore) UpdateQueue(ctx context.Context, name string, req *models.UpdateQueueRequest) (*models.Queue, error) {
	err := s.db.Update(func(tx *bolt.Tx) error {
		queues := tx.Bucket([]byte(queuesBucket))
		q, err := s.loadQueue(tx, name)
		if err != nil {
			return err
		}
		if err := req.Apply(q); err != nil {
			return err
		}
		// A named dead-letter queue must exist.
		if q.DeadLetterQueue != "" && queues.Get([]byte(q.DeadLetterQueue)) == nil {
			return &models.ValidationError{Field: "dead_letter_queue", Message: fmt.Sprintf("dead-letter queue %q does not exist", q.DeadLetterQueue)}
		}
		raw, err := json.Marshal(q)
		if err != nil {
			return err
		}
		return queues.Put([]byte(name), raw)
	})
	if err != nil {
		return nil, err
	}
	return s.GetQueue(ctx, name)
}

func (s *BoltStore) GetQueue(ctx context.Context, name string) (*models.Queue, error) {
	var q *models.Queue
	err := s.db.View(func(tx *bolt.Tx) error {
		loaded, err := s.loadQueue(tx, name)
		if err != nil {
			return err
		}
		vis, inflight, _ := countDepth(tx, name, time.Now().UnixMilli())
		loaded.VisibleMessages = vis
		loaded.InFlightMessages = inflight
		q = loaded
		return nil
	})
	if err != nil {
		return nil, err
	}
	return q, nil
}

// countDepth counts visible vs in-flight messages and the oldest visible age.
func countDepth(tx *bolt.Tx, queue string, nowMillis int64) (visible, inflight, oldestAgeSec int64) {
	b := tx.Bucket(msgsBucketName(queue))
	if b == nil {
		return 0, 0, 0
	}
	var oldestVisibleAt int64 = -1
	c := b.Cursor()
	for k, v := c.First(); k != nil; k, v = c.Next() {
		var m storedMessage
		if json.Unmarshal(v, &m) != nil {
			continue
		}
		if m.InFlight && m.VisibleAt > nowMillis {
			inflight++
			continue
		}
		// Visible (either never received, or its deadline passed).
		if m.VisibleAt <= nowMillis {
			visible++
			if oldestVisibleAt < 0 || m.EnqueuedAt < oldestVisibleAt {
				oldestVisibleAt = m.EnqueuedAt
			}
		} else {
			// A delayed message not yet visible: counted as neither.
		}
	}
	if oldestVisibleAt >= 0 {
		oldestAgeSec = (nowMillis - oldestVisibleAt) / 1000
	}
	return visible, inflight, oldestAgeSec
}

func (s *BoltStore) ListQueues(ctx context.Context) ([]models.Queue, error) {
	var out []models.Queue
	now := time.Now().UnixMilli()
	err := s.db.View(func(tx *bolt.Tx) error {
		return tx.Bucket([]byte(queuesBucket)).ForEach(func(name, raw []byte) error {
			var q models.Queue
			if err := json.Unmarshal(raw, &q); err != nil {
				return err
			}
			q.VisibleMessages, q.InFlightMessages, _ = countDepth(tx, string(name), now)
			out = append(out, q)
			return nil
		})
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

func (s *BoltStore) Stats(ctx context.Context, name string) (*models.QueueStats, error) {
	var stats *models.QueueStats
	now := time.Now().UnixMilli()
	err := s.db.View(func(tx *bolt.Tx) error {
		if _, err := s.loadQueue(tx, name); err != nil {
			return err
		}
		vis, inflight, age := countDepth(tx, name, now)
		stats = &models.QueueStats{Queue: name, VisibleMessages: vis, InFlightMessages: inflight, OldestMessageAgeSeconds: age}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return stats, nil
}

func (s *BoltStore) DeleteQueue(ctx context.Context, name string) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		queues := tx.Bucket([]byte(queuesBucket))
		if queues.Get([]byte(name)) == nil {
			return fmt.Errorf("%w: queue %s", models.ErrNotFound, name)
		}
		// Refuse to delete a queue that is another queue's dead-letter target,
		// which would silently break that queue's dead-lettering.
		var usedBy string
		_ = queues.ForEach(func(k, raw []byte) error {
			var q models.Queue
			if json.Unmarshal(raw, &q) == nil && q.DeadLetterQueue == name {
				usedBy = string(k)
			}
			return nil
		})
		if usedBy != "" {
			return fmt.Errorf("%w: queue %s is the dead-letter queue for %s", models.ErrConflict, name, usedBy)
		}
		if err := queues.Delete([]byte(name)); err != nil {
			return err
		}
		for _, bn := range [][]byte{msgsBucketName(name), indexBucketName(name)} {
			if tx.Bucket(bn) != nil {
				if err := tx.DeleteBucket(bn); err != nil {
					return err
				}
			}
		}
		return nil
	})
}

func (s *BoltStore) PurgeQueue(ctx context.Context, name string) (int64, error) {
	var purged int64
	err := s.db.Update(func(tx *bolt.Tx) error {
		if _, err := s.loadQueue(tx, name); err != nil {
			return err
		}
		msgs := tx.Bucket(msgsBucketName(name))
		purged = int64(msgs.Stats().KeyN)
		// Recreate both buckets empty.
		for _, bn := range [][]byte{msgsBucketName(name), indexBucketName(name)} {
			if err := tx.DeleteBucket(bn); err != nil {
				return err
			}
			if _, err := tx.CreateBucket(bn); err != nil {
				return err
			}
		}
		return nil
	})
	return purged, err
}

// =============================================================================
// Messages
// =============================================================================

func (s *BoltStore) SendMessage(ctx context.Context, queue string, msg *models.Message, visibleAt time.Time) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		if _, err := s.loadQueue(tx, queue); err != nil {
			return err
		}
		stored := storedMessage{Message: *msg, VisibleAt: visibleAt.UnixMilli(), InFlight: false}
		return putMessage(tx, queue, &stored, 0)
	})
}

// putMessage writes a message and its index entry, removing a prior index entry
// at oldVisibleAt when re-indexing an existing message (0 to skip removal).
func putMessage(tx *bolt.Tx, queue string, m *storedMessage, oldVisibleAt int64) error {
	raw, err := json.Marshal(m)
	if err != nil {
		return err
	}
	if err := tx.Bucket(msgsBucketName(queue)).Put([]byte(m.ID), raw); err != nil {
		return err
	}
	index := tx.Bucket(indexBucketName(queue))
	if oldVisibleAt != 0 {
		_ = index.Delete(indexKey(oldVisibleAt, m.ID))
	}
	return index.Put(indexKey(m.VisibleAt, m.ID), []byte(m.ID))
}

func (s *BoltStore) Receive(ctx context.Context, queue string, max int, now time.Time, visibility time.Duration) ([]models.Message, error) {
	var out []models.Message
	err := s.db.Update(func(tx *bolt.Tx) error {
		q, err := s.loadQueue(tx, queue)
		if err != nil {
			return err
		}
		vis := visibility
		if vis <= 0 {
			vis = time.Duration(q.VisibilityTimeoutSeconds) * time.Second
		}
		nowMillis := now.UnixMilli()
		deadline := now.Add(vis).UnixMilli()

		msgs := tx.Bucket(msgsBucketName(queue))
		index := tx.Bucket(indexBucketName(queue))
		c := index.Cursor()

		// Walk the index in visibility order; anything with visibleAt <= now is
		// deliverable. Stop at the first future entry or when the batch is full.
		type hit struct {
			id           string
			oldVisibleAt int64
		}
		var hits []hit
		for k, v := c.First(); k != nil && len(hits) < max; k, v = c.Next() {
			visibleAt := int64(binary.BigEndian.Uint64(k[:8]))
			if visibleAt > nowMillis {
				break // the rest are scheduled for the future
			}
			hits = append(hits, hit{id: string(v), oldVisibleAt: visibleAt})
		}

		for _, h := range hits {
			raw := msgs.Get([]byte(h.id))
			if raw == nil {
				_ = index.Delete(indexKey(h.oldVisibleAt, h.id))
				continue
			}
			var m storedMessage
			if err := json.Unmarshal(raw, &m); err != nil {
				continue
			}
			// Dead-letter at receive time, deterministically: a message that has
			// already been delivered its limit is moved to the DLQ now instead
			// of being redelivered. Doing this here (rather than only in the
			// sweeper) avoids a race where an eager receiver keeps redelivering
			// a poison message before the sweep can dead-letter it. Matches SQS,
			// which redrives on receive.
			if q.MaxReceiveCount > 0 && q.DeadLetterQueue != "" && m.ReceiveCount >= q.MaxReceiveCount {
				_ = msgs.Delete([]byte(m.ID))
				_ = index.Delete(indexKey(h.oldVisibleAt, m.ID))
				if tx.Bucket(msgsBucketName(q.DeadLetterQueue)) != nil {
					dl := storedMessage{Message: m.Message, VisibleAt: nowMillis, InFlight: false}
					dl.ReceiptHandle = ""
					dl.ReceiveCount = 0
					if err := putMessage(tx, q.DeadLetterQueue, &dl, 0); err != nil {
						return err
					}
				}
				continue
			}
			m.InFlight = true
			m.ReceiveCount++
			m.VisibleAt = deadline
			m.ReceiptHandle = models.NewReceiptHandle()
			if err := putMessage(tx, queue, &m, h.oldVisibleAt); err != nil {
				return err
			}
			// Return a copy with the receipt handle; hide internal scheduling.
			delivered := m.Message
			out = append(out, delivered)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// findByReceiptHandle locates a message by its current receipt handle.
func findByReceiptHandle(tx *bolt.Tx, queue, handle string) (*storedMessage, error) {
	msgs := tx.Bucket(msgsBucketName(queue))
	if msgs == nil {
		return nil, fmt.Errorf("%w: queue %s", models.ErrNotFound, queue)
	}
	var found *storedMessage
	c := msgs.Cursor()
	for k, v := c.First(); k != nil; k, v = c.Next() {
		var m storedMessage
		if json.Unmarshal(v, &m) != nil {
			continue
		}
		if m.ReceiptHandle == handle {
			cp := m
			found = &cp
			break
		}
	}
	if found == nil {
		return nil, fmt.Errorf("%w: receipt handle", models.ErrNotFound)
	}
	return found, nil
}

func (s *BoltStore) Delete(ctx context.Context, queue string, handle string) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		if _, err := s.loadQueue(tx, queue); err != nil {
			return err
		}
		m, err := findByReceiptHandle(tx, queue, handle)
		if err != nil {
			return err
		}
		if err := tx.Bucket(msgsBucketName(queue)).Delete([]byte(m.ID)); err != nil {
			return err
		}
		return tx.Bucket(indexBucketName(queue)).Delete(indexKey(m.VisibleAt, m.ID))
	})
}

func (s *BoltStore) ChangeVisibility(ctx context.Context, queue, handle string, now time.Time, visibility time.Duration) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		if _, err := s.loadQueue(tx, queue); err != nil {
			return err
		}
		m, err := findByReceiptHandle(tx, queue, handle)
		if err != nil {
			return err
		}
		old := m.VisibleAt
		m.VisibleAt = now.Add(visibility).UnixMilli()
		m.InFlight = visibility > 0
		return putMessage(tx, queue, m, old)
	})
}

// ReleaseExpired is the maintenance sweep. It scans every queue once.
func (s *BoltStore) ReleaseExpired(ctx context.Context, now time.Time) (released, deadLettered, expired int64, err error) {
	nowMillis := now.UnixMilli()
	err = s.db.Update(func(tx *bolt.Tx) error {
		queues := tx.Bucket([]byte(queuesBucket))
		var names []string
		_ = queues.ForEach(func(k, _ []byte) error { names = append(names, string(k)); return nil })

		for _, name := range names {
			q, err := s.loadQueue(tx, name)
			if err != nil {
				continue
			}
			msgs := tx.Bucket(msgsBucketName(name))
			if msgs == nil {
				continue
			}
			retentionCutoff := nowMillis - int64(q.MessageRetentionSeconds)*1000

			// Collect decisions first; mutating during a cursor walk is unsafe.
			type action struct {
				m        storedMessage
				expire   bool
				deadLett bool
			}
			var actions []action
			c := msgs.Cursor()
			for k, v := c.First(); k != nil; k, v = c.Next() {
				var m storedMessage
				if json.Unmarshal(v, &m) != nil {
					continue
				}
				if m.EnqueuedAt < retentionCutoff {
					actions = append(actions, action{m: m, expire: true})
					continue
				}
				// An in-flight message whose deadline has passed is back for
				// redelivery. Dead-letter it if it has been received too often.
				if m.InFlight && m.VisibleAt <= nowMillis {
					if q.MaxReceiveCount > 0 && m.ReceiveCount >= q.MaxReceiveCount && q.DeadLetterQueue != "" {
						actions = append(actions, action{m: m, deadLett: true})
					} else {
						actions = append(actions, action{m: m}) // release
					}
				}
			}

			for _, a := range actions {
				m := a.m
				switch {
				case a.expire:
					_ = msgs.Delete([]byte(m.ID))
					_ = tx.Bucket(indexBucketName(name)).Delete(indexKey(m.VisibleAt, m.ID))
					expired++
				case a.deadLett:
					// Move to the DLQ: delete here, enqueue there fresh.
					_ = msgs.Delete([]byte(m.ID))
					_ = tx.Bucket(indexBucketName(name)).Delete(indexKey(m.VisibleAt, m.ID))
					dl := storedMessage{Message: m.Message, VisibleAt: nowMillis, InFlight: false}
					dl.ReceiptHandle = ""
					dl.ReceiveCount = 0
					if tx.Bucket(msgsBucketName(q.DeadLetterQueue)) != nil {
						_ = putMessage(tx, q.DeadLetterQueue, &dl, 0)
					}
					deadLettered++
				default:
					// Release: make visible now.
					old := m.VisibleAt
					m.InFlight = false
					m.VisibleAt = nowMillis
					m.ReceiptHandle = ""
					_ = putMessage(tx, name, &m, old)
					released++
				}
			}
		}
		return nil
	})
	return released, deadLettered, expired, err
}

// =============================================================================
// Subscriptions
// =============================================================================

func (s *BoltStore) CreateSubscription(ctx context.Context, sub *models.Subscription) (*models.Subscription, error) {
	sub.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	err := s.db.Update(func(tx *bolt.Tx) error {
		subs := tx.Bucket([]byte(subscriptionsBucket))
		if subs.Get([]byte(sub.Name)) != nil {
			return fmt.Errorf("%w: subscription %s", models.ErrAlreadyExists, sub.Name)
		}
		// The source queue must exist; a missing function is allowed (it shows
		// up as delivery failures rather than blocking creation).
		if _, err := s.loadQueue(tx, sub.Queue); err != nil {
			return err
		}
		raw, err := json.Marshal(sub)
		if err != nil {
			return err
		}
		return subs.Put([]byte(sub.Name), raw)
	})
	if err != nil {
		return nil, err
	}
	return sub, nil
}

func (s *BoltStore) GetSubscription(ctx context.Context, name string) (*models.Subscription, error) {
	var sub *models.Subscription
	err := s.db.View(func(tx *bolt.Tx) error {
		raw := tx.Bucket([]byte(subscriptionsBucket)).Get([]byte(name))
		if raw == nil {
			return fmt.Errorf("%w: subscription %s", models.ErrNotFound, name)
		}
		var out models.Subscription
		if err := json.Unmarshal(raw, &out); err != nil {
			return err
		}
		sub = &out
		return nil
	})
	if err != nil {
		return nil, err
	}
	return sub, nil
}

func (s *BoltStore) ListSubscriptions(ctx context.Context) ([]models.Subscription, error) {
	var out []models.Subscription
	err := s.db.View(func(tx *bolt.Tx) error {
		return tx.Bucket([]byte(subscriptionsBucket)).ForEach(func(_, raw []byte) error {
			var sub models.Subscription
			if err := json.Unmarshal(raw, &sub); err != nil {
				return err
			}
			out = append(out, sub)
			return nil
		})
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

func (s *BoltStore) UpdateSubscription(ctx context.Context, name string, req *models.UpdateSubscriptionRequest) (*models.Subscription, error) {
	var out *models.Subscription
	err := s.db.Update(func(tx *bolt.Tx) error {
		subs := tx.Bucket([]byte(subscriptionsBucket))
		raw := subs.Get([]byte(name))
		if raw == nil {
			return fmt.Errorf("%w: subscription %s", models.ErrNotFound, name)
		}
		var sub models.Subscription
		if err := json.Unmarshal(raw, &sub); err != nil {
			return err
		}
		if err := req.Apply(&sub); err != nil {
			return err
		}
		updated, err := json.Marshal(&sub)
		if err != nil {
			return err
		}
		if err := subs.Put([]byte(name), updated); err != nil {
			return err
		}
		out = &sub
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

func (s *BoltStore) DeleteSubscription(ctx context.Context, name string) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		subs := tx.Bucket([]byte(subscriptionsBucket))
		if subs.Get([]byte(name)) == nil {
			return fmt.Errorf("%w: subscription %s", models.ErrNotFound, name)
		}
		return subs.Delete([]byte(name))
	})
}

func (s *BoltStore) UpdateSubscriptionStats(ctx context.Context, name string, delivered, failed int64, lastErr string, at time.Time) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		subs := tx.Bucket([]byte(subscriptionsBucket))
		raw := subs.Get([]byte(name))
		if raw == nil {
			return nil // deleted mid-cycle; nothing to update
		}
		var sub models.Subscription
		if err := json.Unmarshal(raw, &sub); err != nil {
			return err
		}
		sub.DeliveredTotal += delivered
		sub.FailedTotal += failed
		if lastErr != "" {
			sub.LastError = lastErr
		}
		if delivered+failed > 0 {
			sub.LastDeliveryAt = at.UTC().Format(time.RFC3339)
		}
		updated, err := json.Marshal(&sub)
		if err != nil {
			return err
		}
		return subs.Put([]byte(name), updated)
	})
}

// =============================================================================
// Backups
// =============================================================================

func (s *BoltStore) backupPath(id string) string { return filepath.Join(s.backupDir, id+".json") }

func (s *BoltStore) CreateBackup(ctx context.Context, queue string) (*models.Backup, error) {
	now := time.Now().UTC()
	file := models.BackupFile{
		Backup:   models.Backup{ID: models.NewBackupID(queue, now), Queue: queue, CreatedAt: now.Format(time.RFC3339)},
		Messages: []models.Message{},
	}
	err := s.db.View(func(tx *bolt.Tx) error {
		q, err := s.loadQueue(tx, queue)
		if err != nil {
			return err
		}
		file.Queue = *q
		return tx.Bucket(msgsBucketName(queue)).ForEach(func(_, v []byte) error {
			var m storedMessage
			if err := json.Unmarshal(v, &m); err != nil {
				return err
			}
			// Reset delivery state in the export: a restored message starts
			// fresh and visible.
			m.Message.ReceiptHandle = ""
			file.Messages = append(file.Messages, m.Message)
			return nil
		})
	})
	if err != nil {
		return nil, err
	}
	file.Backup.MessageCount = int64(len(file.Messages))
	raw, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return nil, err
	}
	file.Backup.SizeBytes = int64(len(raw))
	path := s.backupPath(file.Backup.ID)
	if _, err := os.Stat(path); err == nil {
		return nil, fmt.Errorf("%w: backup %s", models.ErrAlreadyExists, file.Backup.ID)
	}
	raw, _ = json.MarshalIndent(file, "", "  ")
	tmp := path + ".partial"
	if err := os.WriteFile(tmp, raw, 0o640); err != nil {
		return nil, err
	}
	if err := os.Rename(tmp, path); err != nil {
		return nil, err
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

func (s *BoltStore) ListBackups(ctx context.Context, queue string) ([]models.Backup, error) {
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
		file, err := s.readBackup(strings.TrimSuffix(e.Name(), ".json"))
		if err != nil {
			continue
		}
		if queue != "" && file.Backup.Queue != queue {
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

func (s *BoltStore) RestoreBackup(ctx context.Context, id, targetQueue string) (*models.Queue, error) {
	file, err := s.readBackup(id)
	if err != nil {
		return nil, err
	}
	queue := targetQueue
	if queue == "" {
		queue = file.Backup.Queue
	}
	nowMillis := time.Now().UnixMilli()
	err = s.db.Update(func(tx *bolt.Tx) error {
		queues := tx.Bucket([]byte(queuesBucket))
		// Recreate the message buckets fresh so restore replaces contents.
		for _, bn := range [][]byte{msgsBucketName(queue), indexBucketName(queue)} {
			if tx.Bucket(bn) != nil {
				if err := tx.DeleteBucket(bn); err != nil {
					return err
				}
			}
			if _, err := tx.CreateBucket(bn); err != nil {
				return err
			}
		}
		cfg := file.Queue
		cfg.Name = queue
		raw, err := json.Marshal(cfg)
		if err != nil {
			return err
		}
		if err := queues.Put([]byte(queue), raw); err != nil {
			return err
		}
		for _, msg := range file.Messages {
			stored := storedMessage{Message: msg, VisibleAt: nowMillis, InFlight: false}
			stored.ReceiptHandle = ""
			if err := putMessage(tx, queue, &stored, 0); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.GetQueue(ctx, queue)
}
