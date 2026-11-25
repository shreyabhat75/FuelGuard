# Deploy FleetFuel Guard to Render

The repository includes `render.yaml`, which creates the frontend, API and PostgreSQL database
as one Render Blueprint. This is the recommended path because it wires service URLs and secrets
without copying credentials into GitHub.

## Option A: Blueprint deployment (recommended)

1. Push the current `main` branch to GitHub.
2. Sign in at <https://dashboard.render.com>.
3. Select **New → Blueprint**.
4. Connect `shreyabhat75/FuelGuard` and select the `main` branch.
5. Render detects `render.yaml`. Review the three resources and select **Apply**.
6. Wait for PostgreSQL, the API and then the static site to finish deploying. The first API boot
   applies migrations and idempotently imports the seven source CSVs, including 54,522 GPS pings.
7. Open `https://fleetfuel-guard-api.onrender.com/api/health`. A successful response contains
   `"ok": true` and `"db": "postgres"`.
8. Open the URL shown for `fleetfuel-guard-web` and sign in with `driver`, `manager`,
   `accountant`, `principal` or `admin`; the demo password is `demo123`.

To verify every deployed account from a local checkout:

```powershell
cd server
$env:API_URL='https://fleetfuel-guard-api.onrender.com/api'
npm run smoke:deployment
```

Service names can receive a suffix if one is already taken. The Blueprint uses Render service
references, so a renamed hostname is still injected into the frontend and CORS configuration.

## What the Blueprint configures

| Resource | Render type | Important settings |
|---|---|---|
| `fleetfuel-guard-web` | Static Site | `npm ci && npm run build`, publish `dist`, `/* → /index.html` rewrite |
| `fleetfuel-guard-api` | Node Web Service | production bundle, `/api/health`, Node 22, `DB_DRIVER=postgres` |
| `fleetfuel-guard-db` | Render Postgres | PostgreSQL 18, Singapore, private-network-only access |

The API receives these values automatically:

| Variable | Source |
|---|---|
| `DATABASE_URL` | Render Postgres internal connection string |
| `JWT_SECRET` | Render-generated secret |
| `CORS_ORIGIN` | static site's Render hostname |
| `DB_DRIVER` | `postgres` (startup fails instead of silently using ephemeral SQLite) |
| `NODE_ENV` | `production` |

The frontend receives `VITE_API_MODE=rest` and the API service hostname at build time.

## Option B: manual setup

### 1. PostgreSQL

1. Select **New → Postgres**.
2. Choose Singapore (the API must use the same region).
3. Copy the **Internal Database URL** after creation.

### 2. Backend web service

Create a Node web service from this repository and use:

| Setting | Value |
|---|---|
| Branch | `main` |
| Region | Singapore |
| Root directory | leave blank |
| Build command | `cd server && npm ci --include=dev && npm run build` |
| Start command | `cd server && npm start` |
| Health check | `/api/health` |

Add these environment variables:

```text
NODE_VERSION=22.15.0
NODE_ENV=production
DB_DRIVER=postgres
DATABASE_URL=<Render Internal Database URL>
JWT_SECRET=<long random value generated in Render>
TOKEN_TTL_HOURS=12
CORS_ORIGIN=<your static-site hostname, with or without https://>
```

Do not set `PORT`; Render provides it. Never paste database or JWT secrets into source files.

### 3. Frontend static site

Create a static site from the same repository and use:

| Setting | Value |
|---|---|
| Branch | `main` |
| Build command | `npm ci && npm run build` |
| Publish directory | `dist` |

Add these build-time variables:

```text
NODE_VERSION=22.15.0
VITE_API_MODE=rest
VITE_API_URL=<API hostname or https://API-hostname/api>
```

Add this rewrite under **Redirects/Rewrites** so React Router pages work after refresh:

```text
Source:      /*
Destination: /index.html
Action:      Rewrite
```

After both services exist, set the backend's `CORS_ORIGIN` to the exact static-site hostname and
redeploy the backend once.

## Persistence and free-tier behavior

- Business data and uploaded evidence are stored in PostgreSQL. Migration v2 moved new image
  bytes into the database, so a Render restart does not lose them.
- The local SQLite fallback remains useful for offline development and smoke tests, but Render
  forces PostgreSQL to prevent accidental writes to an ephemeral filesystem.
- Free web services can spin down after inactivity. The first request after sleep can take longer.
- Free PostgreSQL limits and retention policies can change; review Render's current plan details
  before using this as a production system.

## Verification

1. API health returns HTTP 200 and `"db":"postgres"`.
2. The frontend sign-in screen authenticates with `driver` / `demo123`.
3. Browser developer tools show requests to the Render API host, not `localhost`.
4. Submit an entry with a small JPEG/PNG/WebP image, restart the API and confirm the evidence
   image still opens.
5. Refresh a nested URL such as `/app/dashboard`; it must load instead of returning 404.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Health reports `db: sqlite` | Set `DB_DRIVER=postgres` and use Render's internal `DATABASE_URL`. |
| API fails with PostgreSQL unreachable | Keep API and DB in the same region; reselect the internal URL. |
| Browser reports a CORS error | Set `CORS_ORIGIN` to the static-site hostname and redeploy the API. |
| Frontend stays in mock mode | Set both `VITE_API_MODE=rest` and `VITE_API_URL`, then rebuild the static site. |
| Refreshing a page gives 404 | Add the `/*` to `/index.html` rewrite. |
| Initial API deploy seems slow | The first boot imports 54,522 GPS rows; watch the logs until `/api/health` is ready. |
