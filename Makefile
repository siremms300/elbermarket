.PHONY: help up down logs migrate-create migrate-up migrate-down api mobile tokens test lint

help:
	@echo "ELBER MARKET — development commands"
	@echo ""
	@echo "  make up              Start local infrastructure (Postgres)"
	@echo "  make down            Stop local infrastructure"
	@echo "  make logs            Tail infrastructure logs"
	@echo "  make api             Run the Go API locally"
	@echo "  make mobile          Run the Expo mobile app"
	@echo "  make migrate-up      Apply database migrations"
	@echo "  make migrate-down    Roll back the latest migration"
	@echo "  make migrate-create  Create a new migration (name=...)"
	@echo "  make test            Run all tests"
	@echo "  make lint            Lint everything"

up:
	docker compose -f infrastructure/docker/docker-compose.yml up -d

down:
	docker compose -f infrastructure/docker/docker-compose.yml down

logs:
	docker compose -f infrastructure/docker/docker-compose.yml logs -f

api:
	cd services/api && go run ./cmd/api

mobile:
	cd apps/mobile && npx expo start

migrate-up:
	cd services/api && go run ./cmd/migrate up

migrate-down:
	cd services/api && go run ./cmd/migrate down

migrate-create:
	cd services/api && go run ./cmd/migrate create $(name)

test:
	cd services/api && go test ./...
	cd packages/design-tokens && npm test --if-present

lint:
	cd services/api && go vet ./...
	cd packages/design-tokens && npm run lint --if-present