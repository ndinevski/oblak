package store

import (
	"context"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/oblak/red/internal/models"
)

// MockStore is an in-memory Store for tests. It mirrors BoltStore's visibility
// semantics so the queue and API tests exercise real behaviour.
type MockStore struct {
	mu      sync.Mutex
	queues  map[string]*models.Queue
	msgs    map[string]map[string]*storedMessage // queue -> id -> message
	subs    map[string]*models.Subscription
	backups map[string]*models.BackupFile

	ShouldFail  bool
	FailMessage string
}

// NewMockStore returns an empty mock.
func NewMockStore() *MockStore {
	return &MockStore{
		queues:      map[string]*models.Queue{},
		msgs:        map[string]map[string]*storedMessage{},
		subs:        map[string]*models.Subscription{},
		backups:     map[string]*models.BackupFile{},
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

func (m *MockStore) CreateQueue(ctx context.Context, q *models.Queue) (*models.Queue, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.queues[q.Name]; ok {
		return nil, fmt.Errorf("%w: queue %s", models.ErrAlreadyExists, q.Name)
	}
	if q.DeadLetterQueue != "" {
		if _, ok := m.queues[q.DeadLetterQueue]; !ok {
			return nil, &models.ValidationError{Field: "dead_letter_queue", Message: fmt.Sprintf("dead-letter queue %q does not exist", q.DeadLetterQueue)}
		}
	}
	q.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	cp := *q
	m.queues[q.Name] = &cp
	m.msgs[q.Name] = map[string]*storedMessage{}
	return &cp, nil
}

func (m *MockStore) depth(queue string, nowMillis int64) (visible, inflight, oldestAge int64) {
	var oldestVisible int64 = -1
	for _, sm := range m.msgs[queue] {
		if sm.InFlight && sm.VisibleAt > nowMillis {
			inflight++
			continue
		}
		if sm.VisibleAt <= nowMillis {
			visible++
			if oldestVisible < 0 || sm.EnqueuedAt < oldestVisible {
				oldestVisible = sm.EnqueuedAt
			}
		}
	}
	if oldestVisible >= 0 {
		oldestAge = (nowMillis - oldestVisible) / 1000
	}
	return
}

func (m *MockStore) GetQueue(ctx context.Context, name string) (*models.Queue, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	q, ok := m.queues[name]
	if !ok {
		return nil, fmt.Errorf("%w: queue %s", models.ErrNotFound, name)
	}
	cp := *q
	cp.VisibleMessages, cp.InFlightMessages, _ = m.depth(name, time.Now().UnixMilli())
	return &cp, nil
}

func (m *MockStore) ListQueues(ctx context.Context) ([]models.Queue, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now().UnixMilli()
	out := make([]models.Queue, 0, len(m.queues))
	for name, q := range m.queues {
		cp := *q
		cp.VisibleMessages, cp.InFlightMessages, _ = m.depth(name, now)
		out = append(out, cp)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

func (m *MockStore) Stats(ctx context.Context, name string) (*models.QueueStats, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.queues[name]; !ok {
		return nil, fmt.Errorf("%w: queue %s", models.ErrNotFound, name)
	}
	v, i, age := m.depth(name, time.Now().UnixMilli())
	return &models.QueueStats{Queue: name, VisibleMessages: v, InFlightMessages: i, OldestMessageAgeSeconds: age}, nil
}

func (m *MockStore) UpdateQueue(ctx context.Context, name string, req *models.UpdateQueueRequest) (*models.Queue, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	q, ok := m.queues[name]
	if !ok {
		return nil, fmt.Errorf("%w: queue %s", models.ErrNotFound, name)
	}
	updated := *q
	if err := req.Apply(&updated); err != nil {
		return nil, err
	}
	if updated.DeadLetterQueue != "" {
		if _, ok := m.queues[updated.DeadLetterQueue]; !ok {
			return nil, &models.ValidationError{Field: "dead_letter_queue", Message: fmt.Sprintf("dead-letter queue %q does not exist", updated.DeadLetterQueue)}
		}
	}
	m.queues[name] = &updated
	cp := updated
	return &cp, nil
}

func (m *MockStore) DeleteQueue(ctx context.Context, name string) error {
	if err := m.fail(); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.queues[name]; !ok {
		return fmt.Errorf("%w: queue %s", models.ErrNotFound, name)
	}
	for other, q := range m.queues {
		if q.DeadLetterQueue == name {
			return fmt.Errorf("%w: queue %s is the dead-letter queue for %s", models.ErrConflict, name, other)
		}
	}
	delete(m.queues, name)
	delete(m.msgs, name)
	return nil
}

func (m *MockStore) PurgeQueue(ctx context.Context, name string) (int64, error) {
	if err := m.fail(); err != nil {
		return 0, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.queues[name]; !ok {
		return 0, fmt.Errorf("%w: queue %s", models.ErrNotFound, name)
	}
	n := int64(len(m.msgs[name]))
	m.msgs[name] = map[string]*storedMessage{}
	return n, nil
}

func (m *MockStore) SendMessage(ctx context.Context, queue string, msg *models.Message, visibleAt time.Time) error {
	if err := m.fail(); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.queues[queue]; !ok {
		return fmt.Errorf("%w: queue %s", models.ErrNotFound, queue)
	}
	m.msgs[queue][msg.ID] = &storedMessage{Message: *msg, VisibleAt: visibleAt.UnixMilli(), InFlight: false}
	return nil
}

func (m *MockStore) Receive(ctx context.Context, queue string, max int, now time.Time, visibility time.Duration) ([]models.Message, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	q, ok := m.queues[queue]
	if !ok {
		return nil, fmt.Errorf("%w: queue %s", models.ErrNotFound, queue)
	}
	vis := visibility
	if vis <= 0 {
		vis = time.Duration(q.VisibilityTimeoutSeconds) * time.Second
	}
	nowMillis := now.UnixMilli()
	deadline := now.Add(vis).UnixMilli()

	// Deliver oldest-visible first, matching the bolt index order.
	var candidates []*storedMessage
	for _, sm := range m.msgs[queue] {
		if sm.VisibleAt <= nowMillis {
			candidates = append(candidates, sm)
		}
	}
	sort.Slice(candidates, func(i, j int) bool { return candidates[i].VisibleAt < candidates[j].VisibleAt })

	var out []models.Message
	for _, sm := range candidates {
		if len(out) >= max {
			break
		}
		// Dead-letter at receive time, matching BoltStore.
		if q.MaxReceiveCount > 0 && q.DeadLetterQueue != "" && sm.ReceiveCount >= q.MaxReceiveCount {
			delete(m.msgs[queue], sm.ID)
			if m.msgs[q.DeadLetterQueue] != nil {
				dl := &storedMessage{Message: sm.Message, VisibleAt: nowMillis, InFlight: false}
				dl.ReceiptHandle = ""
				dl.ReceiveCount = 0
				m.msgs[q.DeadLetterQueue][dl.ID] = dl
			}
			continue
		}
		sm.InFlight = true
		sm.ReceiveCount++
		sm.VisibleAt = deadline
		sm.ReceiptHandle = models.NewReceiptHandle()
		out = append(out, sm.Message)
	}
	return out, nil
}

func (m *MockStore) findHandle(queue, handle string) *storedMessage {
	for _, sm := range m.msgs[queue] {
		if sm.ReceiptHandle == handle {
			return sm
		}
	}
	return nil
}

func (m *MockStore) Delete(ctx context.Context, queue, handle string) error {
	if err := m.fail(); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.queues[queue]; !ok {
		return fmt.Errorf("%w: queue %s", models.ErrNotFound, queue)
	}
	sm := m.findHandle(queue, handle)
	if sm == nil {
		return fmt.Errorf("%w: receipt handle", models.ErrNotFound)
	}
	delete(m.msgs[queue], sm.ID)
	return nil
}

func (m *MockStore) ChangeVisibility(ctx context.Context, queue, handle string, now time.Time, visibility time.Duration) error {
	if err := m.fail(); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.queues[queue]; !ok {
		return fmt.Errorf("%w: queue %s", models.ErrNotFound, queue)
	}
	sm := m.findHandle(queue, handle)
	if sm == nil {
		return fmt.Errorf("%w: receipt handle", models.ErrNotFound)
	}
	sm.VisibleAt = now.Add(visibility).UnixMilli()
	sm.InFlight = visibility > 0
	return nil
}

func (m *MockStore) ReleaseExpired(ctx context.Context, now time.Time) (released, deadLettered, expired int64, err error) {
	if err := m.fail(); err != nil {
		return 0, 0, 0, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	nowMillis := now.UnixMilli()
	for name, q := range m.queues {
		retentionCutoff := nowMillis - int64(q.MessageRetentionSeconds)*1000
		for id, sm := range m.msgs[name] {
			if sm.EnqueuedAt < retentionCutoff {
				delete(m.msgs[name], id)
				expired++
				continue
			}
			if sm.InFlight && sm.VisibleAt <= nowMillis {
				if q.MaxReceiveCount > 0 && sm.ReceiveCount >= q.MaxReceiveCount && q.DeadLetterQueue != "" {
					delete(m.msgs[name], id)
					dl := &storedMessage{Message: sm.Message, VisibleAt: nowMillis, InFlight: false}
					dl.ReceiptHandle = ""
					dl.ReceiveCount = 0
					if m.msgs[q.DeadLetterQueue] != nil {
						m.msgs[q.DeadLetterQueue][dl.ID] = dl
					}
					deadLettered++
				} else {
					sm.InFlight = false
					sm.VisibleAt = nowMillis
					sm.ReceiptHandle = ""
					released++
				}
			}
		}
	}
	return released, deadLettered, expired, nil
}

func (m *MockStore) CreateSubscription(ctx context.Context, sub *models.Subscription) (*models.Subscription, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.subs[sub.Name]; ok {
		return nil, fmt.Errorf("%w: subscription %s", models.ErrAlreadyExists, sub.Name)
	}
	if _, ok := m.queues[sub.Queue]; !ok {
		return nil, fmt.Errorf("%w: queue %s", models.ErrNotFound, sub.Queue)
	}
	sub.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	cp := *sub
	m.subs[sub.Name] = &cp
	return &cp, nil
}

func (m *MockStore) GetSubscription(ctx context.Context, name string) (*models.Subscription, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	sub, ok := m.subs[name]
	if !ok {
		return nil, fmt.Errorf("%w: subscription %s", models.ErrNotFound, name)
	}
	cp := *sub
	return &cp, nil
}

func (m *MockStore) ListSubscriptions(ctx context.Context) ([]models.Subscription, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]models.Subscription, 0, len(m.subs))
	for _, sub := range m.subs {
		out = append(out, *sub)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

func (m *MockStore) UpdateSubscription(ctx context.Context, name string, req *models.UpdateSubscriptionRequest) (*models.Subscription, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	sub, ok := m.subs[name]
	if !ok {
		return nil, fmt.Errorf("%w: subscription %s", models.ErrNotFound, name)
	}
	if err := req.Apply(sub); err != nil {
		return nil, err
	}
	cp := *sub
	return &cp, nil
}

func (m *MockStore) DeleteSubscription(ctx context.Context, name string) error {
	if err := m.fail(); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.subs[name]; !ok {
		return fmt.Errorf("%w: subscription %s", models.ErrNotFound, name)
	}
	delete(m.subs, name)
	return nil
}

func (m *MockStore) UpdateSubscriptionStats(ctx context.Context, name string, delivered, failed int64, lastErr string, at time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	sub, ok := m.subs[name]
	if !ok {
		return nil
	}
	sub.DeliveredTotal += delivered
	sub.FailedTotal += failed
	if lastErr != "" {
		sub.LastError = lastErr
	}
	if delivered+failed > 0 {
		sub.LastDeliveryAt = at.UTC().Format(time.RFC3339)
	}
	return nil
}

func (m *MockStore) CreateBackup(ctx context.Context, queue string) (*models.Backup, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	q, ok := m.queues[queue]
	if !ok {
		return nil, fmt.Errorf("%w: queue %s", models.ErrNotFound, queue)
	}
	now := time.Now().UTC()
	file := &models.BackupFile{
		Backup:   models.Backup{ID: models.NewBackupID(queue, now), Queue: queue, CreatedAt: now.Format(time.RFC3339)},
		Queue:    *q,
		Messages: []models.Message{},
	}
	for _, sm := range m.msgs[queue] {
		cp := sm.Message
		cp.ReceiptHandle = ""
		file.Messages = append(file.Messages, cp)
	}
	file.Backup.MessageCount = int64(len(file.Messages))
	m.backups[file.Backup.ID] = file
	return &file.Backup, nil
}

func (m *MockStore) ListBackups(ctx context.Context, queue string) ([]models.Backup, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]models.Backup, 0, len(m.backups))
	for _, f := range m.backups {
		if queue != "" && f.Backup.Queue != queue {
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
	m.mu.Lock()
	defer m.mu.Unlock()
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

func (m *MockStore) RestoreBackup(ctx context.Context, id, targetQueue string) (*models.Queue, error) {
	if err := m.fail(); err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	f, ok := m.backups[id]
	if !ok {
		return nil, fmt.Errorf("%w: backup %s", models.ErrNotFound, id)
	}
	queue := targetQueue
	if queue == "" {
		queue = f.Backup.Queue
	}
	nowMillis := time.Now().UnixMilli()
	cfg := f.Queue
	cfg.Name = queue
	m.queues[queue] = &cfg
	m.msgs[queue] = map[string]*storedMessage{}
	for _, msg := range f.Messages {
		cp := msg
		cp.ReceiptHandle = ""
		m.msgs[queue][cp.ID] = &storedMessage{Message: cp, VisibleAt: nowMillis, InFlight: false}
	}
	out := cfg
	return &out, nil
}
