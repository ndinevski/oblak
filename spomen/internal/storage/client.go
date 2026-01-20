package storage

import (
	"context"
	"fmt"
	"io"
	"net/url"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/minio/minio-go/v7/pkg/tags"
	"github.com/n1xx1n/spomen/internal/models"
)

// Client wraps the Minio client with a simplified API
type Client struct {
	minio    *minio.Client
	endpoint string
}

// Config holds the storage client configuration
type Config struct {
	Endpoint  string
	AccessKey string
	SecretKey string
	UseSSL    bool
	Region    string
}

// NewClient creates a new storage client
func NewClient(cfg Config) (*Client, error) {
	client, err := minio.New(cfg.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: cfg.UseSSL,
		Region: cfg.Region,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create minio client: %w", err)
	}

	return &Client{
		minio:    client,
		endpoint: cfg.Endpoint,
	}, nil
}

// HealthCheck verifies the connection to Minio
func (c *Client) HealthCheck(ctx context.Context) error {
	_, err := c.minio.ListBuckets(ctx)
	return err
}

// =============================================================================
// Bucket Operations
// =============================================================================

// ListBuckets returns all buckets
func (c *Client) ListBuckets(ctx context.Context) ([]models.Bucket, error) {
	buckets, err := c.minio.ListBuckets(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list buckets: %w", err)
	}

	result := make([]models.Bucket, 0, len(buckets))
	for _, b := range buckets {
		bucket := models.Bucket{
			Name:      b.Name,
			CreatedAt: b.CreationDate,
		}

		// Get bucket policy
		policy, _ := c.GetBucketPolicy(ctx, b.Name)
		bucket.Policy = policy

		// Get versioning status
		versioning, _ := c.minio.GetBucketVersioning(ctx, b.Name)
		bucket.Versioning = versioning.Status == "Enabled"

		result = append(result, bucket)
	}

	return result, nil
}

// GetBucket returns bucket details
func (c *Client) GetBucket(ctx context.Context, name string) (*models.Bucket, error) {
	exists, err := c.minio.BucketExists(ctx, name)
	if err != nil {
		return nil, fmt.Errorf("failed to check bucket: %w", err)
	}
	if !exists {
		return nil, fmt.Errorf("bucket not found: %s", name)
	}

	// Get bucket info
	buckets, err := c.minio.ListBuckets(ctx)
	if err != nil {
		return nil, err
	}

	var bucket *models.Bucket
	for _, b := range buckets {
		if b.Name == name {
			bucket = &models.Bucket{
				Name:      b.Name,
				CreatedAt: b.CreationDate,
			}
			break
		}
	}

	if bucket == nil {
		return nil, fmt.Errorf("bucket not found: %s", name)
	}

	// Get policy
	bucket.Policy, _ = c.GetBucketPolicy(ctx, name)

	// Get versioning
	versioning, _ := c.minio.GetBucketVersioning(ctx, name)
	bucket.Versioning = versioning.Status == "Enabled"

	// Count objects and total size
	var objectCount int64
	var totalSize int64
	for object := range c.minio.ListObjects(ctx, name, minio.ListObjectsOptions{Recursive: true}) {
		if object.Err != nil {
			continue
		}
		objectCount++
		totalSize += object.Size
	}
	bucket.ObjectCount = objectCount
	bucket.TotalSize = totalSize

	// Get tags
	tags, err := c.minio.GetBucketTagging(ctx, name)
	if err == nil {
		bucket.Tags = tags.ToMap()
	}

	return bucket, nil
}

// CreateBucket creates a new bucket
func (c *Client) CreateBucket(ctx context.Context, req models.CreateBucketRequest) (*models.Bucket, error) {
	// Validate bucket name
	if err := validateBucketName(req.Name); err != nil {
		return nil, err
	}

	// Check if bucket exists
	exists, err := c.minio.BucketExists(ctx, req.Name)
	if err != nil {
		return nil, fmt.Errorf("failed to check bucket: %w", err)
	}
	if exists {
		return nil, fmt.Errorf("bucket already exists: %s", req.Name)
	}

	// Create bucket
	if err := c.minio.MakeBucket(ctx, req.Name, minio.MakeBucketOptions{}); err != nil {
		return nil, fmt.Errorf("failed to create bucket: %w", err)
	}

	// Set policy if specified
	if req.Policy != "" && req.Policy != "private" {
		if err := c.SetBucketPolicy(ctx, req.Name, req.Policy); err != nil {
			// Rollback bucket creation on policy error
			c.minio.RemoveBucket(ctx, req.Name)
			return nil, fmt.Errorf("failed to set bucket policy: %w", err)
		}
	}

	// Enable versioning if requested
	if req.Versioning {
		if err := c.minio.EnableVersioning(ctx, req.Name); err != nil {
			return nil, fmt.Errorf("failed to enable versioning: %w", err)
		}
	}

	// Set tags if provided
	if len(req.Tags) > 0 {
		if err := c.SetBucketTags(ctx, req.Name, req.Tags); err != nil {
			return nil, fmt.Errorf("failed to set bucket tags: %w", err)
		}
	}

	return c.GetBucket(ctx, req.Name)
}

// UpdateBucket updates bucket settings
func (c *Client) UpdateBucket(ctx context.Context, name string, req models.UpdateBucketRequest) (*models.Bucket, error) {
	exists, err := c.minio.BucketExists(ctx, name)
	if err != nil {
		return nil, fmt.Errorf("failed to check bucket: %w", err)
	}
	if !exists {
		return nil, fmt.Errorf("bucket not found: %s", name)
	}

	// Update policy
	if req.Policy != nil {
		if err := c.SetBucketPolicy(ctx, name, *req.Policy); err != nil {
			return nil, fmt.Errorf("failed to update bucket policy: %w", err)
		}
	}

	// Update versioning
	if req.Versioning != nil {
		if *req.Versioning {
			if err := c.minio.EnableVersioning(ctx, name); err != nil {
				return nil, fmt.Errorf("failed to enable versioning: %w", err)
			}
		} else {
			if err := c.minio.SuspendVersioning(ctx, name); err != nil {
				return nil, fmt.Errorf("failed to suspend versioning: %w", err)
			}
		}
	}

	// Update tags
	if req.Tags != nil {
		if err := c.SetBucketTags(ctx, name, req.Tags); err != nil {
			return nil, fmt.Errorf("failed to update bucket tags: %w", err)
		}
	}

	return c.GetBucket(ctx, name)
}

// DeleteBucket deletes a bucket
func (c *Client) DeleteBucket(ctx context.Context, name string, force bool) error {
	exists, err := c.minio.BucketExists(ctx, name)
	if err != nil {
		return fmt.Errorf("failed to check bucket: %w", err)
	}
	if !exists {
		return fmt.Errorf("bucket not found: %s", name)
	}

	// If force, delete all objects first
	if force {
		objectsCh := c.minio.ListObjects(ctx, name, minio.ListObjectsOptions{
			Recursive:    true,
			WithVersions: true,
		})

		for object := range objectsCh {
			if object.Err != nil {
				continue
			}
			opts := minio.RemoveObjectOptions{VersionID: object.VersionID}
			if err := c.minio.RemoveObject(ctx, name, object.Key, opts); err != nil {
				return fmt.Errorf("failed to delete object %s: %w", object.Key, err)
			}
		}
	}

	if err := c.minio.RemoveBucket(ctx, name); err != nil {
		return fmt.Errorf("failed to delete bucket: %w", err)
	}

	return nil
}

// GetBucketPolicy returns the bucket policy type
func (c *Client) GetBucketPolicy(ctx context.Context, name string) (string, error) {
	policy, err := c.minio.GetBucketPolicy(ctx, name)
	if err != nil {
		return "private", nil
	}

	if strings.Contains(policy, `"Action":["s3:GetObject"]`) {
		if strings.Contains(policy, `"Action":["s3:PutObject"]`) {
			return "public-read-write", nil
		}
		return "public-read", nil
	}

	return "private", nil
}

// SetBucketPolicy sets the bucket access policy
func (c *Client) SetBucketPolicy(ctx context.Context, name, policy string) error {
	var policyJSON string

	switch policy {
	case "private":
		// Remove any existing policy
		return c.minio.SetBucketPolicy(ctx, name, "")
	case "public-read":
		policyJSON = fmt.Sprintf(`{
			"Version": "2012-10-17",
			"Statement": [{
				"Effect": "Allow",
				"Principal": {"AWS": ["*"]},
				"Action": ["s3:GetObject"],
				"Resource": ["arn:aws:s3:::%s/*"]
			}]
		}`, name)
	case "public-read-write":
		policyJSON = fmt.Sprintf(`{
			"Version": "2012-10-17",
			"Statement": [{
				"Effect": "Allow",
				"Principal": {"AWS": ["*"]},
				"Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
				"Resource": ["arn:aws:s3:::%s/*"]
			}]
		}`, name)
	default:
		return fmt.Errorf("invalid policy: %s (use: private, public-read, public-read-write)", policy)
	}

	return c.minio.SetBucketPolicy(ctx, name, policyJSON)
}

// SetBucketTags sets bucket tags
func (c *Client) SetBucketTags(ctx context.Context, name string, t map[string]string) error {
	if len(t) == 0 {
		return c.minio.RemoveBucketTagging(ctx, name)
	}

	bucketTags, err := tags.NewTags(t, false)
	if err != nil {
		return fmt.Errorf("failed to create tags: %w", err)
	}
	return c.minio.SetBucketTagging(ctx, name, bucketTags)
}

// =============================================================================
// Object Operations
// =============================================================================

// ListObjects lists objects in a bucket
func (c *Client) ListObjects(ctx context.Context, bucket string, prefix string, delimiter string, maxKeys int, marker string) (*models.ObjectList, error) {
	exists, err := c.minio.BucketExists(ctx, bucket)
	if err != nil {
		return nil, fmt.Errorf("failed to check bucket: %w", err)
	}
	if !exists {
		return nil, fmt.Errorf("bucket not found: %s", bucket)
	}

	opts := minio.ListObjectsOptions{
		Prefix:     prefix,
		Recursive:  delimiter == "",
		StartAfter: marker,
	}

	result := &models.ObjectList{
		Objects:   make([]models.Object, 0),
		Prefix:    prefix,
		Delimiter: delimiter,
	}

	prefixSet := make(map[string]bool)
	count := 0

	for object := range c.minio.ListObjects(ctx, bucket, opts) {
		if object.Err != nil {
			return nil, fmt.Errorf("error listing objects: %w", object.Err)
		}

		// Handle delimiter for directory-like listing
		if delimiter != "" && prefix != "" {
			relKey := strings.TrimPrefix(object.Key, prefix)
			if idx := strings.Index(relKey, delimiter); idx >= 0 {
				commonPrefix := prefix + relKey[:idx+1]
				if !prefixSet[commonPrefix] {
					prefixSet[commonPrefix] = true
					result.CommonPrefixes = append(result.CommonPrefixes, commonPrefix)
				}
				continue
			}
		}

		if maxKeys > 0 && count >= maxKeys {
			result.IsTruncated = true
			result.NextMarker = object.Key
			break
		}

		result.Objects = append(result.Objects, models.Object{
			Key:          object.Key,
			Size:         object.Size,
			ContentType:  object.ContentType,
			ETag:         object.ETag,
			LastModified: object.LastModified,
		})
		count++
	}

	return result, nil
}

// GetObject retrieves an object
func (c *Client) GetObject(ctx context.Context, bucket, key string) (io.ReadCloser, *models.Object, error) {
	obj, err := c.minio.GetObject(ctx, bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get object: %w", err)
	}

	info, err := obj.Stat()
	if err != nil {
		obj.Close()
		return nil, nil, fmt.Errorf("object not found: %s/%s", bucket, key)
	}

	meta := &models.Object{
		Key:          info.Key,
		Size:         info.Size,
		ContentType:  info.ContentType,
		ETag:         info.ETag,
		LastModified: info.LastModified,
		Metadata:     info.UserMetadata,
		VersionID:    info.VersionID,
	}

	return obj, meta, nil
}

// GetObjectInfo retrieves object metadata without the content
func (c *Client) GetObjectInfo(ctx context.Context, bucket, key string) (*models.Object, error) {
	info, err := c.minio.StatObject(ctx, bucket, key, minio.StatObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("object not found: %s/%s", bucket, key)
	}

	return &models.Object{
		Key:          info.Key,
		Size:         info.Size,
		ContentType:  info.ContentType,
		ETag:         info.ETag,
		LastModified: info.LastModified,
		Metadata:     info.UserMetadata,
		VersionID:    info.VersionID,
	}, nil
}

// PutObject uploads an object
func (c *Client) PutObject(ctx context.Context, bucket, key string, reader io.Reader, size int64, contentType string, metadata map[string]string) (*models.Object, error) {
	exists, err := c.minio.BucketExists(ctx, bucket)
	if err != nil {
		return nil, fmt.Errorf("failed to check bucket: %w", err)
	}
	if !exists {
		return nil, fmt.Errorf("bucket not found: %s", bucket)
	}

	opts := minio.PutObjectOptions{
		ContentType:  contentType,
		UserMetadata: metadata,
	}

	info, err := c.minio.PutObject(ctx, bucket, key, reader, size, opts)
	if err != nil {
		return nil, fmt.Errorf("failed to upload object: %w", err)
	}

	return &models.Object{
		Key:          info.Key,
		Size:         info.Size,
		ETag:         info.ETag,
		ContentType:  contentType,
		LastModified: time.Now(),
		VersionID:    info.VersionID,
	}, nil
}

// DeleteObject deletes an object
func (c *Client) DeleteObject(ctx context.Context, bucket, key string) error {
	err := c.minio.RemoveObject(ctx, bucket, key, minio.RemoveObjectOptions{})
	if err != nil {
		return fmt.Errorf("failed to delete object: %w", err)
	}
	return nil
}

// DeleteObjects deletes multiple objects
func (c *Client) DeleteObjects(ctx context.Context, bucket string, keys []string) ([]string, []error) {
	deleted := make([]string, 0)
	errors := make([]error, 0)

	for _, key := range keys {
		if err := c.DeleteObject(ctx, bucket, key); err != nil {
			errors = append(errors, err)
		} else {
			deleted = append(deleted, key)
		}
	}

	return deleted, errors
}

// CopyObject copies an object
func (c *Client) CopyObject(ctx context.Context, bucket string, req models.CopyObjectRequest) (*models.Object, error) {
	src := minio.CopySrcOptions{
		Bucket: req.SourceBucket,
		Object: req.SourceKey,
	}

	dst := minio.CopyDestOptions{
		Bucket:       bucket,
		Object:       req.DestKey,
		UserMetadata: req.Metadata,
	}

	info, err := c.minio.CopyObject(ctx, dst, src)
	if err != nil {
		return nil, fmt.Errorf("failed to copy object: %w", err)
	}

	return &models.Object{
		Key:          info.Key,
		Size:         info.Size,
		ETag:         info.ETag,
		LastModified: info.LastModified,
	}, nil
}

// GetPresignedURL generates a presigned URL
func (c *Client) GetPresignedURL(ctx context.Context, bucket string, req models.PresignedURLRequest) (*models.PresignedURLResponse, error) {
	expires := time.Duration(req.ExpiresIn) * time.Second
	if expires == 0 {
		expires = time.Hour
	}

	var presignedURL *url.URL
	var err error

	switch strings.ToUpper(req.Method) {
	case "GET":
		presignedURL, err = c.minio.PresignedGetObject(ctx, bucket, req.Key, expires, nil)
	case "PUT":
		presignedURL, err = c.minio.PresignedPutObject(ctx, bucket, req.Key, expires)
	default:
		return nil, fmt.Errorf("invalid method: %s (use GET or PUT)", req.Method)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to generate presigned URL: %w", err)
	}

	return &models.PresignedURLResponse{
		URL:       presignedURL.String(),
		Key:       req.Key,
		Method:    strings.ToUpper(req.Method),
		ExpiresAt: time.Now().Add(expires),
	}, nil
}

// =============================================================================
// Helpers
// =============================================================================

func validateBucketName(name string) error {
	if len(name) < 3 || len(name) > 63 {
		return fmt.Errorf("bucket name must be between 3 and 63 characters")
	}
	if strings.Contains(name, "..") {
		return fmt.Errorf("bucket name cannot contain '..'")
	}
	// Basic S3 bucket naming rules
	for _, c := range name {
		if !((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '.') {
			return fmt.Errorf("bucket name can only contain lowercase letters, numbers, hyphens, and periods")
		}
	}
	return nil
}
