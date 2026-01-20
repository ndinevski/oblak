# Storage Configuration Guide

Impuls supports two storage backends for function metadata and code:

## 1. File System Storage (Default)

Stores function metadata as JSON files and code as files on the local filesystem.

### Configuration

```bash
./impuls-server --storage file --data-dir /var/lib/impuls
```

### Structure

```
/var/lib/impuls/functions/
├── metadata/
│   ├── function1.json
│   └── function2.json
└── code/
    ├── function1/
    │   └── function.js
    └── function2/
        └── function.js
```

### Pros
- Simple setup
- No external dependencies
- Good for development and single-instance deployments

### Cons
- Not suitable for multi-instance deployments
- No automatic replication or backup
- Limited scalability

## 2. PostgreSQL Storage (Recommended for Production)

Stores function metadata and code in a PostgreSQL database.

### Configuration

```bash
./impuls-server --storage postgres --db-conn "postgres://user:pass@localhost:5432/impuls?sslmode=disable"
```

### Database Schema

The storage layer automatically creates the necessary tables:

```sql
CREATE TABLE functions (
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
```

### Environment Variables

- `STORAGE_TYPE`: `file` or `postgres` (default: `file`)
- `DB_CONN`: PostgreSQL connection string (required for postgres storage)

### Docker Compose

The included `docker-compose.yml` sets up PostgreSQL automatically:

```bash
docker compose up -d
```

This starts:
- PostgreSQL database on port 5432
- Impuls server connected to PostgreSQL

### Manual PostgreSQL Setup

1. Create database:
```bash
createdb impuls
```

2. Run migrations:
```bash
psql impuls < internal/storage/migrations.sql
```

3. Start server:
```bash
./impuls-server --storage postgres --db-conn "postgres://localhost/impuls?sslmode=disable"
```

### Pros
- Production-ready
- Supports multiple server instances
- Built-in replication and backup capabilities
- Better performance for concurrent operations
- Transactional consistency

### Cons
- Requires PostgreSQL setup
- Additional operational complexity

## Testing

### File Storage Tests

```bash
go test ./internal/storage -run TestFileStorage
```

### PostgreSQL Storage Tests

Set up a test database and run:

```bash
export TEST_DATABASE_URL="postgres://localhost:5432/impuls_test?sslmode=disable"
go test ./internal/storage -run TestPostgresStorage
```

Tests will skip if PostgreSQL is not available.

## Migration from File to PostgreSQL

To migrate existing functions from file storage to PostgreSQL:

1. Backup your functions directory
2. Export functions via API:
```bash
curl http://localhost:8080/api/v1/functions > functions_backup.json
```

3. Switch to PostgreSQL storage
4. Re-import functions via API

## Performance Considerations

### File Storage
- Fast for small deployments (< 100 functions)
- I/O bound for large deployments
- Single mutex for all operations

### PostgreSQL Storage
- Connection pooling for concurrent requests
- Indexed queries for fast lookups
- JSONB for flexible environment variables
- Suitable for thousands of functions

## Security

### File Storage
- Ensure proper file permissions (0644 for data, 0755 for directories)
- Backup regularly

### PostgreSQL Storage
- Use SSL connections in production (`sslmode=require`)
- Implement proper database user permissions
- Enable PostgreSQL authentication
- Regular database backups via `pg_dump`

## Backup and Recovery

### File Storage
```bash
# Backup
tar -czf impuls-backup.tar.gz /var/lib/impuls/functions

# Restore
tar -xzf impuls-backup.tar.gz -C /
```

### PostgreSQL Storage
```bash
# Backup
pg_dump impuls > impuls_backup.sql

# Restore
psql impuls < impuls_backup.sql
```

## Monitoring

### File Storage
- Monitor disk space
- Check file system permissions
- Track directory size

### PostgreSQL Storage
- Monitor database connections
- Check query performance
- Monitor table sizes
- Set up connection pooling
- Enable query logging for debugging

## Future Enhancements

Planned storage backends:
- S3/MinIO for code storage (hybrid approach)
- Redis for caching
- Distributed storage with etcd
