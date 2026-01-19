.PHONY: start stop restart logs status create-user create-bucket clean help

# Default target
help:
	@echo "Spomen - Object Storage Service"
	@echo ""
	@echo "Usage:"
	@echo "  make start          - Start the service"
	@echo "  make stop           - Stop the service"
	@echo "  make restart        - Restart the service"
	@echo "  make logs           - View logs"
	@echo "  make status         - Check service status"
	@echo "  make create-user    - Create a new user (USER=name PASS=secret)"
	@echo "  make create-bucket  - Create a new bucket (BUCKET=name)"
	@echo "  make clean          - Remove all data (DANGEROUS)"
	@echo ""

start:
	@./scripts/start.sh

stop:
	@./scripts/stop.sh

restart: stop start

logs:
	docker compose logs -f minio

status:
	@docker compose ps
	@echo ""
	@docker compose exec minio mc admin info local 2>/dev/null || echo "Service not running"

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
