# 🏃 Garmin Dashboard

Self-hosted Garmin health data pipeline + dashboard.  
Pulls all data from Garmin Connect → stores in PostgreSQL on your home server.

---

## Project Structure

```
garmin-dashboard/
├── docker-compose.yml       ← runs DB + sync + API services
├── .env.example             ← copy this to .env and fill in credentials
├── .gitignore
├── db/
│   └── init.sql             ← database schema (auto-runs on first start)
├── sync/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── sync.py              ← main sync loop
│   └── db.py                ← database helpers
└── api/
    ├── Dockerfile
    ├── requirements.txt
    ├── main.py              ← FastAPI app (REST endpoints)
    └── db.py                ← database helpers
```

---

## Setup (on your home server)

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/garmin-dashboard.git
cd garmin-dashboard
```

### 2. Create your `.env` file

```bash
cp .env.example .env
nano .env          # fill in your Garmin email, password, and DB password
```

### 3. Start everything

```bash
docker compose up -d --build
```

That's it. The sync service will:
- **First run:** backfill the last 30 days of data
- **Every hour:** sync the last 2 days (catches any late-arriving data)

### 4. Check logs

```bash
docker compose logs -f sync    # watch sync progress
docker compose logs -f api     # watch API server
docker compose logs -f db      # watch database
```

### 5. Connect to the database directly (optional)

```bash
docker compose exec db psql -U garmin -d garmin
```

Useful queries:
```sql
SELECT date, steps, resting_hr, body_battery_high FROM daily_summary ORDER BY date DESC LIMIT 7;
SELECT date, sleep_score, duration_seconds/3600.0 AS hours FROM sleep ORDER BY date DESC LIMIT 7;
SELECT date, hrv_last_night, hrv_status FROM hrv ORDER BY date DESC LIMIT 7;
```

### 5. Try the API

```bash
# Health check
curl http://localhost:8000/health

# Interactive API docs (Swagger UI)
open http://localhost:8000/docs

# Example queries
curl "http://localhost:8000/api/summary"
curl "http://localhost:8000/api/daily?start=2024-01-01&end=2024-01-31"
curl "http://localhost:8000/api/activities?activity_type=RUNNING"
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | DB connectivity check |
| GET | `/api/daily` | Daily summary (steps, HR, stress, body battery, SpO2) |
| GET | `/api/sleep` | Sleep data (duration, stages, score) |
| GET | `/api/hrv` | HRV data |
| GET | `/api/activities` | Workouts (filter by `activity_type`) |
| GET | `/api/summary` | 7-day & 30-day aggregated stats |

All endpoints accept optional `start` and `end` date query params (`YYYY-MM-DD`).  
Default range is the last 30 days.

---

## Data collected

| Table | What's stored |
|---|---|
| `daily_summary` | Steps, calories, stress, body battery, SpO2, resting HR |
| `sleep` | Duration, sleep stages (light/deep/REM), sleep score |
| `hrv` | HRV weekly avg, last night, 5-min peak, status |
| `activities` | All workouts — type, duration, distance, HR, pace, Training Effect |
| `heart_rate_intraday` | Minute-by-minute HR (coming soon) |

---

## Stopping / restarting

```bash
docker compose down        # stop (data is preserved in volumes)
docker compose up -d       # start again
docker compose down -v     # ⚠️  stop AND delete all data
```

---

## Roadmap

- [x] Phase 1 — Data pipeline
- [x] Phase 2 — FastAPI backend (REST endpoints)
- [ ] Phase 3 — React dashboard with charts
