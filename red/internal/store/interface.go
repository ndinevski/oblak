// Package store is Red's persistence layer.
//
// Defined as an interface, like the other Oblak services, so the queue logic
// and API can be tested without touching disk. BoltStore is the real embedded
// implementation; MockStore is the in-memory one the tests use.
package store

import (
	"context"
	"time"

	"github.com/oblak/red/internal/models"
)

// Store is everything Red needs from its storage layer.
//
// The store owns the visibility-timeout state machine: a message is either
// visible (deliverable when its visible-at time has passed) or in-flight
// (received, hidden until its visibility deadline). Receive moves a message
// in-flight and stamps a fresh receipt handle; Delete removes it by handle;
// the sweep in ReleaseExpired returns timed-out in-flight messages to visible
// (or dead-letters them). All times are unix milliseconds.
type Store interface {
	Health(ctx context.Context) error

	// Queues
	ListQueues(ctx context.Context) ([]models.Queue, error)
	GetQueue(ctx context.Context, name string) (*models.Queue, error)
	CreateQueue(ctx context.Context, q *models.Queue) (*models.Queue, error)
	UpdateQueue(ctx context.Context, name string, req *models.UpdateQueueRequest) (*models.Queue, error)
	DeleteQueue(ctx context.Context, name string) error
	Stats(ctx context.Context, name string) (*models.QueueStats, error)
	PurgeQueue(ctx context.Context, name string) (int64, error)

	// Messages
	SendMessage(ctx context.Context, queue string, msg *models.Message, visibleAt time.Time) error
	// Receive returns up to max messages that are visible as of now, moving each
	// in-flight until visibilityDeadline. A zero visibilityDeadline means use
	// the queue's default.
	Receive(ctx context.Context, queue string, max int, now time.Time, visibility time.Duration) ([]models.Message, error)
	// Delete acks a received message by receipt handle. Returns ErrNotFound if
	// the handle is unknown or stale (already redelivered).
	Delete(ctx context.Context, queue string, receiptHandle string) error
	// ChangeVisibility extends or shortens an in-flight message's deadline.
	ChangeVisibility(ctx context.Context, queue string, receiptHandle string, now time.Time, visibility time.Duration) error

	// ReleaseExpired is the maintenance sweep: it returns in-flight messages
	// whose deadline has passed to the visible set, dead-letters those over the
	// receive limit, and drops messages past their retention. Returns counts.
	ReleaseExpired(ctx context.Context, now time.Time) (released, deadLettered, expired int64, err error)

	// Subscriptions (Impuls triggers)
	ListSubscriptions(ctx context.Context) ([]models.Subscription, error)
	GetSubscription(ctx context.Context, name string) (*models.Subscription, error)
	CreateSubscription(ctx context.Context, sub *models.Subscription) (*models.Subscription, error)
	UpdateSubscription(ctx context.Context, name string, req *models.UpdateSubscriptionRequest) (*models.Subscription, error)
	DeleteSubscription(ctx context.Context, name string) error
	// UpdateSubscriptionStats records the outcome of a dispatch cycle.
	UpdateSubscriptionStats(ctx context.Context, name string, delivered, failed int64, lastErr string, at time.Time) error

	// Backups
	CreateBackup(ctx context.Context, queue string) (*models.Backup, error)
	ListBackups(ctx context.Context, queue string) ([]models.Backup, error)
	GetBackup(ctx context.Context, id string) (*models.Backup, error)
	DeleteBackup(ctx context.Context, id string) error
	RestoreBackup(ctx context.Context, id, targetQueue string) (*models.Queue, error)

	Close() error
}

// Ensure the implementations satisfy the interface.
var (
	_ Store = (*BoltStore)(nil)
	_ Store = (*MockStore)(nil)
)
