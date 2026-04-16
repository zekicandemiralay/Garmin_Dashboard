# Garmin Dashboard

Self-hosted Garmin health data pipeline and dashboard. Pulls your entire Garmin Connect history into a PostgreSQL database and displays it in a React frontend with charts and an interactive map.

**What you get:**
- Daily stats: steps, calories, stress, body battery, SpO2, resting HR
- Sleep: duration, stages (light/deep/REM), sleep score
- HRV trends and status
- All activities with GPS route maps, speed-colored polylines, and personal bests
- Rolling averages, training load, sleep debt, and more

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
├── garmin_login.py          ← run once to generate OAuth tokens
├── db/
│   └── init.sql             ← database schema (auto-applied on first start)
├── sync/
│   ├── sync.py              ← main sync loop (runs hourly)
│   ├── db.py                ← database helpers
│   ├── backfill_all.py      ← one-shot recovery script (run manually if needed)
│   ├── fetch_polylines.py   ← utility: fetch GPS polylines for all activities
│   └── resync_gps.py        ← utility: re-fetch all activity coordinates
├── api/
│   ├── main.py              ← FastAPI REST backend
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
- `GARMIN_EMAIL` and `GARMIN_PASSWORD` — your Garmin Connect credentials
- `POSTGRES_PASSWORD` — any password you choose for the local database

### 3. Generate Garmin auth tokens

Garmin uses OAuth. Run this once to save tokens to disk (avoids storing your password long-term):

```bash
python garmin_login.py
```

This creates a `garth_tokens/` directory. After this you can clear `GARMIN_PASSWORD` from your `.env` if you want — the sync service will use the saved tokens.

### 4. Start everything

```bash
docker compose up -d --build
```

On **first run**, the sync service automatically backfills up to 10 years of Garmin history. This takes a while — watch progress with:

```bash
docker compose logs -f sync
```

On subsequent runs it syncs incrementally (last 7 days + any historical gaps, every hour).

### 5. Open the dashboard

```
http://localhost:3000
```

---

## Check what was synced

```bash
docker compose exec db psql -U garmin -d garmin
```

```sql
-- Activity count and date range
SELECT MIN(start_time::date), MAX(start_time::date), COUNT(*) FROM activities;

-- Recent daily stats
SELECT date, steps, resting_hr, body_battery_high FROM daily_summary ORDER BY date DESC LIMIT 7;

-- Sleep last week
SELECT date, sleep_score, round(duration_seconds/3600.0, 1) AS hours FROM sleep ORDER BY date DESC LIMIT 7;
```

---

## API

The REST API runs on port 8000. Interactive docs: `http://localhost:8000/docs`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | DB connectivity check |
| GET | `/api/range` | Earliest and latest dates in DB |
| GET | `/api/daily` | Daily summary (steps, HR, stress, body battery, SpO2) |
| GET | `/api/sleep` | Sleep data (duration, stages, score) |
| GET | `/api/hrv` | HRV data |
| GET | `/api/activities` | Workouts (filter by `activity_type`) |
| GET | `/api/activities/map` | Activities with GPS polylines for map view |
| GET | `/api/summary` | 7-day and 30-day aggregated stats |

All endpoints accept optional `start` and `end` query params (`YYYY-MM-DD`). Default range is the last 30 days.

---

## Recovery utilities

If activities or GPS routes are missing, run the full backfill script:

```bash
docker compose exec sync python backfill_all.py
```

This runs in 3 phases:
1. Syncs any historical data not yet in the DB
2. Re-fetches activity metadata for outdoor activities missing GPS coordinates
3. Fetches GPS polylines for all activities that have coordinates but no route

The regular sync also self-heals: every hour it checks for missing coordinates and polylines and fills them in automatically.

---

## Stopping / restarting

```bash
docker compose down        # stop (data preserved in volumes)
docker compose up -d       # start again
docker compose down -v     # stop AND delete all data
```
