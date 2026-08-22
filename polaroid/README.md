# Polaroid - Photo & Video Management

Polaroid is the dedicated photo and video management service for the Oblak platform. Powered by Immich, it provides a high-performance, self-hosted alternative to Google Photos, featuring AI-powered organization and seamless mobile integration.

## Features

- **Photo/video timeline**: View your media in a beautiful, chronologically organized timeline with automatic time buckets.
- **Album management**: Create, share, and manage collections of your favorite memories.
- **People & facial recognition**: Automatically detect and group photos by the people appearing in them.
- **AI-powered smart search (CLIP)**: Search your library using natural language descriptions thanks to advanced machine learning.
- **Map view**: Explore your media geographically through interactive maps using embedded GPS metadata.
- **Shared links with password/expiry**: Share individual assets or whole albums with secure, time-limited links.
- **Mobile app upload (via Immich app)**: Synchronize your mobile device's camera roll directly to your private cloud.
- **Storage & API key management**: Control where your data is stored and manage access keys for third-party integrations.
- **Per-user isolation**: Every Oblak user receives a dedicated, isolated environment for their personal media.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Oblak Dashboard                         │
│                   (Frontend & React UI)                      │
└──────────────┬──────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│                      Strapi Backend                          │
│                   (API Proxy & Auth)                         │
└──────────────┬──────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│                      Immich Server                           │
│                   (Core Logic & API)                         │
├──────────────┬───────────────┬───────────────┬──────────────┤
│              │               │               │              │
┌──────────────▼─┐     ┌───────▼───────┐     ┌─▼──────────────┐
│   Immich ML    │     │ Immich Redis  │     │ Immich Postgres│
│ (CLIP/Facial)  │     │ (Cache/Jobs)  │     │ (w/ pgvecto.rs)│
└────────────────┘     └───────────────┘     └────────────────┘

Storage Path: Host Filesystem (~/.oblak/polaroid/library)
```

## Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for Oblak dashboard integration)
- ~2GB RAM minimum for Machine Learning containers
- Linux or macOS host environment

## Quick Start

### 1. Start the service
```bash
# Start from the root directory
make up-polaroid

# Or navigate to the folder
cd polaroid
docker compose up -d
```

Note: The first boot takes 2-3 minutes while the system imports geodata (approx. 224k records).

### 2. Admin Setup
Perform the initial administrative setup:
```bash
curl -X POST http://localhost:2283/api/auth/admin-sign-up \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@oblak.local","password":"YourSecurePassword123!","name":"Oblak Admin"}'
```

### 3. API Key Generation
Login and generate a key for the Strapi backend:
```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:2283/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@oblak.local","password":"YourSecurePassword123!"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

# Create Key
curl -X POST http://localhost:2283/api/api-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"oblak-dashboard","permissions":["all"]}'
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| IMMICH_VERSION | Docker image version tag | latest |
| POLAROID_PORT | Public port for the Immich server | 2283 |
| UPLOAD_LOCATION | Host path for media storage | ~/.oblak/polaroid/library |
| DB_USERNAME | Postgres database user | postgres |
| DB_PASSWORD | Postgres database password | (random) |
| DB_DATABASE_NAME | Postgres database name | immich |
| POLAROID_URL | URL used by Strapi backend | http://localhost:2283 |
| POLAROID_API_KEY | API Key for Strapi integration | (generated) |

## Docker Commands

```bash
# Start all containers
make up-polaroid

# Stop all containers
make down-polaroid

# View logs
make logs-polaroid

# Check container status
docker compose -f polaroid/docker-compose.yml ps

# Rebuild containers
docker compose -f polaroid/docker-compose.yml up -d --build
```

## API Reference

The following routes are proxied through the Strapi backend at `/api/polaroid/*`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| **Server** | | |
| GET | /polaroid/server/info | Get server statistics |
| GET | /polaroid/server/ping | Health check |
| **Assets** | | |
| GET | /polaroid/assets | List assets with filters |
| GET | /polaroid/assets/statistics | Get asset count statistics |
| POST | /polaroid/assets/exist | Check if assets already exist |
| GET | /polaroid/assets/:assetId | Get asset details |
| GET | /polaroid/assets/:assetId/thumbnail | Get asset thumbnail |
| GET | /polaroid/assets/:assetId/original | Download original asset |
| POST | /polaroid/assets/upload | Upload new asset |
| DELETE | /polaroid/assets | Delete assets by IDs |
| **Timeline** | | |
| GET | /polaroid/timeline/buckets | Get time-grouped asset counts |
| GET | /polaroid/timeline/bucket | Get assets in a time bucket |
| **Albums** | | |
| GET | /polaroid/albums | List albums |
| POST | /polaroid/albums | Create album |
| GET | /polaroid/albums/:albumId | Get album details |
| PATCH | /polaroid/albums/:albumId | Update album |
| DELETE | /polaroid/albums/:albumId | Delete album |
| PUT | /polaroid/albums/:albumId/assets | Add assets to album |
| DELETE | /polaroid/albums/:albumId/assets | Remove assets from album |
| **People** | | |
| GET | /polaroid/people | List recognized people |
| GET | /polaroid/people/:personId | Get person details |
| PUT | /polaroid/people/:personId | Update person |
| GET | /polaroid/people/:personId/thumbnail | Get person thumbnail |
| POST | /polaroid/people/:personId/merge | Merge duplicate people |
| **Search** | | |
| POST | /polaroid/search/metadata | Search by EXIF/metadata |
| POST | /polaroid/search/smart | AI-powered semantic search |
| **Map** | | |
| GET | /polaroid/map/markers | Get geotagged photo markers |
| GET | /polaroid/map/reverse-geocode | Reverse geocode coordinates |
| **Shared Links** | | |
| GET | /polaroid/shared-links | List shared links |
| POST | /polaroid/shared-links | Create shared link |
| GET | /polaroid/shared-links/:linkId | Get shared link details |
| PATCH | /polaroid/shared-links/:linkId | Update shared link |
| DELETE | /polaroid/shared-links/:linkId | Delete shared link |
| **Tags** | | |
| GET | /polaroid/tags | List tags |
| POST | /polaroid/tags | Create tag |
| PATCH | /polaroid/tags/:tagId | Update tag |
| DELETE | /polaroid/tags/:tagId | Delete tag |
| PUT | /polaroid/tags/:tagId/assets | Tag assets |
| DELETE | /polaroid/tags/:tagId/assets | Untag assets |
| **API Keys** | | |
| GET | /polaroid/api-keys | List API keys |
| POST | /polaroid/api-keys | Create API key |
| DELETE | /polaroid/api-keys/:keyId | Delete API key |

## Mobile App Setup

1. Download the Immich app from the Apple App Store or Google Play Store.
2. Open the app and enter your server URL (e.g., `http://your-server-ip:2283`).
3. Authenticate using your generated API key or credentials.
4. Enable background backup to keep your mobile media synchronized with Oblak.

## Per-User Isolation

Polaroid implements a multi-tenant architecture where each Oblak user has their own private space. On the first time a user accesses the Polaroid tab in the dashboard, the system automatically provisions a corresponding Immich account. This ensures that photos and videos remain private and isolated between different users of the platform.

## Storage

Polaroid uses a bind mount to the host filesystem at `~/.oblak/polaroid/library` for all media storage. This approach is preferred over Docker volumes for easier backups and direct file access. You can customize the storage location by modifying the `UPLOAD_LOCATION` variable in your environment file.

## Project Structure

```
oblak/
├── polaroid/               # Main service folder
│   ├── docker-compose.yml  # Container orchestration
│   └── .env.example        # Configuration template
├── backend-dashboard/      # Strapi implementation
│   └── src/api/polaroid/   # API proxy routes & controllers
├── frontend-dashboard/     # React implementation
│   └── src/pages/polaroid/ # User interface pages
└── Makefile                # Root-level service management
```

## Troubleshooting

- **First boot delay**: The geodata import takes 2-3 minutes. If the server appears unresponsive initially, check the logs and wait for the import to complete.
- **ML container issues**: Ensure your host has sufficient RAM (2GB+). The machine-learning container should not have an `IMMICH_HOST` variable defined as it communicates via internal networking.
- **API key regeneration**: If the dashboard cannot connect to Polaroid, follow the admin setup steps to generate and configure a new API key.
- **Port conflicts**: By default, Polaroid uses port 2283. If this port is occupied, update `POLAROID_PORT` in your configuration.

## License

MIT
