# Migration Guide: File Storage to PostgreSQL

This guide helps you migrate from file-based storage to PostgreSQL storage.

## Prerequisites

- PostgreSQL 12+ installed and running
- Backup of your current function data
- Access to the Impuls API

## Step 1: Backup Current Functions

### Option A: Via API

```bash
# Export all functions to a file
curl http://localhost:8080/api/v1/functions | jq '.functions' > functions_backup.json

# Verify backup
cat functions_backup.json | jq length
```

### Option B: Via Filesystem

```bash
# Backup the entire functions directory
tar -czf impuls-functions-backup-$(date +%Y%m%d).tar.gz /var/lib/impuls/functions/

# Verify backup
tar -tzf impuls-functions-backup-*.tar.gz | head
```

## Step 2: Setup PostgreSQL

### Using Docker Compose

```bash
# Start PostgreSQL
docker compose up -d postgres

# Wait for it to be ready
docker compose logs -f postgres
# Wait for "database system is ready to accept connections"
```

### Manual Setup

```bash
# Create database
createdb impuls

# Create user
psql -c "CREATE USER impuls WITH PASSWORD 'your-secure-password';"
psql -c "GRANT ALL PRIVILEGES ON DATABASE impuls TO impuls;"

# Run migrations
psql -U impuls -d impuls < internal/storage/migrations.sql
```

## Step 3: Update Configuration

### Docker Compose

Edit your `docker-compose.yml`:

```yaml
environment:
  - STORAGE_TYPE=postgres
  - DB_CONN=postgres://impuls:impuls123@postgres:5432/impuls?sslmode=disable
```

### Command Line

```bash
./impuls-server \
  --storage postgres \
  --db-conn "postgres://impuls:your-secure-password@localhost:5432/impuls?sslmode=disable"
```

### Environment Variables

```bash
export STORAGE_TYPE=postgres
export DB_CONN="postgres://impuls:your-secure-password@localhost:5432/impuls?sslmode=disable"
./impuls-server
```

## Step 4: Migrate Functions

### Option A: Via API (Recommended)

```bash
# Read backup and recreate each function
jq -c '.[]' functions_backup.json | while read function; do
    name=$(echo $function | jq -r '.name')
    echo "Migrating function: $name"
    
    # Create function with all properties
    curl -X POST http://localhost:8080/api/v1/functions \
      -H "Content-Type: application/json" \
      -d "$function"
    
    echo ""
done
```

### Option B: Using Script

Create a migration script `migrate.sh`:

```bash
#!/bin/bash
set -e

BACKUP_FILE="functions_backup.json"
API_URL="http://localhost:8080/api/v1"

echo "Starting migration..."

# Count functions
TOTAL=$(jq length $BACKUP_FILE)
echo "Found $TOTAL functions to migrate"

# Migrate each function
COUNT=0
jq -c '.[]' $BACKUP_FILE | while read function; do
    COUNT=$((COUNT+1))
    name=$(echo $function | jq -r '.name')
    
    echo "[$COUNT/$TOTAL] Migrating: $name"
    
    response=$(curl -s -w "\n%{http_code}" -X POST $API_URL/functions \
      -H "Content-Type: application/json" \
      -d "$function")
    
    status=$(echo "$response" | tail -n1)
    
    if [ "$status" = "201" ]; then
        echo "  ✓ Success"
    else
        echo "  ✗ Failed (HTTP $status)"
        echo "  Response: $(echo "$response" | head -n-1)"
    fi
done

echo "Migration complete!"
```

Run it:

```bash
chmod +x migrate.sh
./migrate.sh
```

## Step 5: Verify Migration

```bash
# Check function count
curl http://localhost:8080/api/v1/functions | jq '.count'

# List all functions
curl http://localhost:8080/api/v1/functions | jq '.functions[].name'

# Test a specific function
curl http://localhost:8080/api/v1/functions/your-function-name

# Test invocation
curl -X POST http://localhost:8080/api/v1/functions/your-function-name/invoke?local=true \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

## Step 6: Verify Database

```bash
# Connect to database
psql -U impuls -d impuls

# Check functions table
SELECT id, name, runtime, created_at FROM functions;

# Count functions
SELECT COUNT(*) FROM functions;

# Check specific function
SELECT * FROM functions WHERE name = 'your-function-name';

# Exit
\q
```

## Rollback (If Needed)

If something goes wrong, you can rollback:

### Using Docker Compose

```bash
# Stop services
docker compose down

# Restore file storage configuration
# Edit docker-compose.yml to use STORAGE_TYPE=file

# Start with file storage
docker compose up -d
```

### Restore from Backup

```bash
# Stop server
sudo systemctl stop impuls

# Restore files
tar -xzf impuls-functions-backup-*.tar.gz -C /

# Update configuration back to file storage
./impuls-server --storage file --data-dir /var/lib/impuls
```

## Troubleshooting

### Connection Errors

```bash
# Test database connection
psql "postgres://impuls:password@localhost:5432/impuls?sslmode=disable"

# Check if PostgreSQL is running
docker compose ps postgres
# or
sudo systemctl status postgresql
```

### Migration Failures

```bash
# Check logs
docker compose logs impuls

# Verify function data
curl http://localhost:8080/api/v1/functions | jq '.functions[] | {name, runtime, handler}'
```

### Performance Issues

```bash
# Check database indexes
psql -U impuls -d impuls -c '\d+ functions'

# Check connection pool
psql -U impuls -d impuls -c "SELECT * FROM pg_stat_activity WHERE datname = 'impuls';"
```

## Post-Migration

### Cleanup

After successful migration and verification:

```bash
# Archive old file storage (don't delete immediately)
tar -czf old-functions-$(date +%Y%m%d).tar.gz /var/lib/impuls/functions/
mv old-functions-*.tar.gz /backup/

# Optional: Clear old function files
# rm -rf /var/lib/impuls/functions/*
```

### Backup Strategy

Setup regular PostgreSQL backups:

```bash
# Add to cron
0 2 * * * pg_dump -U impuls impuls > /backup/impuls-$(date +\%Y\%m\%d).sql
```

### Monitoring

Monitor your PostgreSQL instance:

```sql
-- Function count
SELECT COUNT(*) as total_functions FROM functions;

-- Storage size
SELECT pg_size_pretty(pg_total_relation_size('functions')) as table_size;

-- Recent activity
SELECT name, created_at, updated_at 
FROM functions 
ORDER BY updated_at DESC 
LIMIT 10;
```

## Need Help?

- Check logs: `docker compose logs -f impuls`
- Database status: `docker compose exec postgres psql -U impuls -c '\l'`
- Test connection: `docker compose exec impuls sh -c 'echo | nc postgres 5432'`
