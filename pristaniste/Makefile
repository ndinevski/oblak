.PHONY: build test dev start stop restart logs status clean help

# Default target
help:
	@echo "Pristaniste - Container Service"
	@echo ""
	@echo "Usage:"
	@echo "  make build          - Build the API server"
	@echo "  make test           - Run tests"
	@echo "  make dev            - Run locally for development"
	@echo "  make start          - Start the service (Docker)"
	@echo "  make stop           - Stop the service"
	@echo "  make restart        - Restart the service"
	@echo "  make logs           - View logs"
	@echo "  make status         - Check service status"
	@echo "  make clean          - Remove all data (DANGEROUS)"
	@echo ""

build:
	go build -o pristaniste-server ./cmd/pristaniste-server

test:
	@echo "Running tests..."
	go test -v ./...

dev: build
	./pristaniste-server --port 8083 --registry-url http://localhost:5000 --registry-host localhost:5000

start:
	docker compose up -d --build

stop:
	docker compose down

restart: stop start

logs:
	docker compose logs -f

logs-api:
	docker compose logs -f pristaniste-api

status:
	@docker compose ps
	@echo ""
	@curl -s http://localhost:8083/health | jq . 2>/dev/null || echo "API not running"

clean:
	@echo "WARNING: This will delete every pushed image!"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ]
	docker compose down -v
