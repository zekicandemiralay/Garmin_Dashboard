# Garmin Dashboard

Self-hosted Garmin health data pipeline and dashboard. Pulls your entire Garmin Connect history into a PostgreSQL database and displays it in a React frontend with charts and an interactive map.

**What you get:**
- Daily stats: steps, calories, stress, body battery, SpO2, resting HR
- Sleep: duration, stages (light/deep/REM), sleep score, respiration
- HRV trends and status
- All activities with GPS route maps, speed/temperature/wind-colored polylines, personal bests
- Touring mode: multi-day trip view with weather overlay, country crossings, sleep locations
- Multi-user: each user has isolated data and manages their own Garmin credentials

---

## Requirements

- Docker + Docker Compose
- A Garmin Connect account

---

## Project Structure

```
garmin-dashboard/
├── docker-compose.yml       ← all 4 services (db, sync, api, frontend)
├── .env.example             ← copy to .env and fill in credentials
├── db/
│   └── init.sql             ← database schema (auto-applied on first start)
├── sync/
│   ├── sync.py              ← main sync loop (runs hourly)
│   └── db.py                ← database helpers
├── api/
│   ├── main.py              ← FastAPI REST backend
│   ├── auth.py              ← JWT, bcrypt, Fernet encryption helpers
│   └── db.py                ← database helpers
└── frontend/
    └── src/
        ├── App.tsx
        ├── components/      ← all chart and UI components
        ├── types.ts
        ├── api.ts
        └── stats.ts
```

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/zekicandemiralay/Garmin_Dashboard.git
cd Garmin_Dashboard
```

### 2. Create your `.env` file

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Description |
|----------|-------------|
| `SECRET_KEY` | Encryption key for credentials and JWT tokens — **required** |
| `POSTGRES_PASSWORD` | Any password for the local database |
| `GARMIN_EMAIL` / `GARMIN_PASSWORD` | Optional — only needed for initial single-user migration |

Generate a `SECRET_KEY`:

```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### 3. Start everything

```bash
docker compose up -d --build
```

On **first run** the sync service:
1. Creates the database schema
2. Creates a default admin account (`admin` / `admin`) — **change this immediately**
3. Migrates any `GARMIN_EMAIL`/`GARMIN_PASSWORD` env vars to encrypted DB credentials
4. Begins backfilling up to 10 years of Garmin history

Watch progress:

```bash
docker compose logs -f sync
```

### 4. Open the dashboard

```
http://localhost:3000
```

Log in with `admin` / `admin`.

### 5. First-login checklist

1. **Change the admin password** — user menu (top right) → Settings → Change Password
2. **Set Garmin credentials** — user menu → Settings → Garmin Credentials
   - Credentials are stored encrypted and cannot be read back — only the sync service uses them
3. **Remove `GARMIN_EMAIL`/`GARMIN_PASSWORD`** from `.env` once saved (no longer needed)
4. **Restart sync** to pick up the credentials immediately:
   ```bash
   docker compose restart sync
   ```

---

## User management

Admins can create and delete users via user menu → Manage users.

Each user:
- Has completely isolated data (activities, sleep, HRV, tours)
- Sets their own Garmin credentials via Settings — no one else can read them back
- Can change their own password

---

## Updating

```bash
git pull
docker compose build
docker compose up -d
```

The sync service runs `ensure_schema()` on startup and handles any database migrations automatically.

---

## Check what was synced

```bash
docker compose exec db psql -U garmin -d garmin
```

```sql
-- Activity count and date range per user
SELECT u.username, MIN(a.start_time::date), MAX(a.start_time::date), COUNT(*)
FROM activities a JOIN users u ON u.id = a.user_id
GROUP BY u.username;

-- Recent daily stats
SELECT date, steps, resting_hr, body_battery_high FROM daily_summary ORDER BY date DESC LIMIT 7;

-- Sleep last week
SELECT date, sleep_score, round(duration_seconds/3600.0, 1) AS hours FROM sleep ORDER BY date DESC LIMIT 7;
```

---

## API

The REST API runs on port 8000. Interactive docs: `http://localhost:8000/docs`

All data endpoints require a Bearer token obtained from `POST /auth/login`.

**Auth**

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Login — returns JWT token |
| GET | `/auth/me` | Current user info |
| PUT | `/auth/me/password` | Change password |
| PUT | `/auth/me/garmin` | Set Garmin credentials (write-only) |

**Data** (all require auth, scoped to the authenticated user)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/range` | Earliest and latest dates in DB |
| GET | `/api/daily` | Daily summary (steps, HR, stress, body battery, SpO2) |
| GET | `/api/sleep` | Sleep data (duration, stages, score) |
| GET | `/api/hrv` | HRV data |
| GET | `/api/activities` | Workouts |
| GET | `/api/activities/map` | Activities with GPS polylines |
| GET | `/api/activities/countries` | Stats grouped by country |
| GET | `/api/summary` | 7-day and 30-day aggregated stats |
| GET | `/api/touring` | Touring activities with weather and country crossings |
| GET/POST | `/api/tours` | Named tours (multi-day trips) |
| GET/PUT/DELETE | `/api/tours/{id}` | Tour detail, update, delete |

**Admin** (require admin role)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List all users |
| POST | `/api/admin/users` | Create user |
| DELETE | `/api/admin/users/{id}` | Delete user and all their data |

All data endpoints accept optional `start` and `end` query params (`YYYY-MM-DD`).

---

## Stopping / restarting

```bash
docker compose down        # stop (data preserved in volumes)
docker compose up -d       # start again
docker compose down -v     # stop AND delete all data
```
