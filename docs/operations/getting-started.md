# Getting started

## Prerequisites

- Go 1.22 or later
- Node.js 20 or later
- Docker and Docker Compose
- Expo CLI (`npm install -g expo-cli`) — optional, `npx expo` works too

## First-time setup

1. Clone the repository.
2. Copy `.env.example` to `.env` at the repository root and fill in values.
3. Start local infrastructure:

       make up

4. Apply database migrations:

       make migrate-up

5. Start the API:

       make api

6. In another terminal, start the mobile app:

       make mobile

## Verifying the setup

- API health: `curl http://localhost:8080/healthz`
- API readiness: `curl http://localhost:8080/readyz`
- Mobile: the app should boot to the splash screen.

## Common tasks

- Create a migration: `make migrate-create name=add_users`
- Run tests: `make test`
- Lint: `make lint`