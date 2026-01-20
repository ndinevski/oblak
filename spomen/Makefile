.PHONY: build start stop restart logs status create-user create-bucket clean dev test help

# Default target
help:
	@echo "Spomen - Object Storage Service"
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
	@echo "  make create-user    - Create a new user (USER=name PASS=secret)"
	@echo "  make create-bucket  - Create a new bucket (BUCKET=name)"
	@echo "  make clean          - Remove all data (DANGEROUS)"
	@echo ""

build:
	go build -o spomen-server ./cmd/spomen-server

test:
	@echo "Running tests..."
	go test -v ./...

dev: build
	./spomen-server --port 8081 --minio-endpoint localhost:9000

start:
	@./scripts/start.sh

stop:
	@./scripts/stop.sh

restart: stop start

logs:
	docker compose logs -f

logs-api:
	docker compose logs -f spomen-api

status:
	@docker compose ps
	@echo ""
	@curl -s http://localhost:8081/health | jq . 2>/dev/null || echo "API not running"

create-user:
	@if [ -z "$(USER)" ] || [ -z "$(PASS)" ]; then \
		echo "Usage: make create-user USER=username PASS=password [POLICY=readwrite]"; \
		exit 1; \
	fi
	@./scripts/create-user.sh "$(USER)" "$(PASS)" "$(POLICY)"

create-bucket:
	@if [ -z "$(BUCKET)" ]; then \
		echo "Usage: make create-bucket BUCKET=bucket-name [PUBLIC=public]"; \
		exit 1; \
	fi
	@./scripts/create-bucket.sh "$(BUCKET)" "$(PUBLIC)"

clean:
	@echo "WARNING: This will delete all data!"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ]
	docker compose down -v
	rm -rf ./data/*
