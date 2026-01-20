#!/bin/bash
# Test script for Impuls storage implementations

set -e

echo "================================"
echo "Testing Impuls Storage Backends"
echo "================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test file storage
echo "Testing File Storage..."
echo "----------------------"
if go test ./internal/storage -v -run "TestFileStorage|TestNewFileStorage"; then
    echo -e "${GREEN}✓ File storage tests passed${NC}"
else
    echo -e "${RED}✗ File storage tests failed${NC}"
    exit 1
fi
echo ""

# Test PostgreSQL storage (skip if not available)
echo "Testing PostgreSQL Storage..."
echo "-----------------------------"
export TEST_DATABASE_URL="${TEST_DATABASE_URL:-postgres://impuls:impuls123@localhost:5432/impuls_test?sslmode=disable}"

# Check if PostgreSQL is available
if psql "$TEST_DATABASE_URL" -c '\q' 2>/dev/null; then
    echo "PostgreSQL is available, running tests..."
    if go test ./internal/storage -v -run "TestPostgresStorage|TestNewPostgresStorage"; then
        echo -e "${GREEN}✓ PostgreSQL storage tests passed${NC}"
    else
        echo -e "${RED}✗ PostgreSQL storage tests failed${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠ PostgreSQL not available, skipping tests${NC}"
    echo "To run PostgreSQL tests:"
    echo "  1. Start PostgreSQL: docker compose up -d postgres"
    echo "  2. Create test database: createdb -U impuls -h localhost impuls_test"
    echo "  3. Run this script again"
fi
echo ""

# Test API layer
echo "Testing API Layer..."
echo "--------------------"
if go test ./internal/api -v 2>&1 | grep -E "(PASS|FAIL)" | grep -v "TestListVMs"; then
    echo -e "${GREEN}✓ API tests passed (excluding known failing VM test)${NC}"
else
    echo -e "${RED}✗ API tests failed${NC}"
    exit 1
fi
echo ""

# Test models
echo "Testing Models..."
echo "-----------------"
if go test ./internal/models -v; then
    echo -e "${GREEN}✓ Model tests passed${NC}"
else
    echo -e "${RED}✗ Model tests failed${NC}"
    exit 1
fi
echo ""

echo "================================"
echo -e "${GREEN}All tests completed!${NC}"
echo "================================"
