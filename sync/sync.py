"""
Garmin → PostgreSQL Sync Service
─────────────────────────────────
Runs in a loop. On first run it backfills SYNC_BACKFILL_DAYS days.
After that it syncs the last 2 days every SYNC_INTERVAL_SECONDS seconds.
"""

import os
import time
import logging
from datetime import date, timedelta, datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from garminconnect import Garmin

import db

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

GARMIN_EMAIL    = os.getenv("GARMIN_EMAIL")
GARMIN_PASSWORD = os.getenv("GARMIN_PASSWORD")
BACKFILL_DAYS   = int(os.getenv("SYNC_BACKFILL_DAYS", 3650))
INTERVAL        = int(os.getenv("SYNC_INTERVAL_SECONDS", 3600))
GPS_BATCH_SIZE  = int(os.getenv("GPS_BATCH_SIZE", 50))   # polylines fetched per sync cycle
TOKEN_DIR       = str(Path("/root/.garth").resolve())

client: Garmin = None


# ─── Auth ─────────────────────────────────────────────────────────────────────

def login():
    """
    Try to resume from saved OAuth tokens first.
    Falls back to email/password only if tokens are missing/expired
    AND credentials are provided in the environment.
    """
    global client
    Path(TOKEN_DIR).mkdir(parents=True, exist_ok=True)

    client = Garmin(email=GARMIN_EMAIL, password=GARMIN_PASSWORD)

    try:
        mfa_status, _ = client.login(tokenstore=TOKEN_DIR)
        if mfa_status:
            raise RuntimeError("MFA required but not supported in headless mode.")
        log.info("Garmin session ready (tokens loaded or fresh login).")
    except Exception as e:
        if not GARMIN_EMAIL or not GARMIN_PASSWORD:
            raise RuntimeError(
                "No valid saved tokens and GARMIN_EMAIL/GARMIN_PASSWORD not set. "
                "Run garmin_login.py once to create saved tokens."
            ) from e
        raise


# ─── Fetch helpers ─────────────────────────────────────────────────────────────

def _date_str(d: date) -> str:
    return d.strftime("%Y-%m-%d")


def fetch_daily_summary(d: date) -> dict | None:
    ds = _date_str(d)
    try:
        s = client.get_user_summary(ds)
        if not s:
            return None
        return {
            "date":                 d,
            "steps":                s.get("totalSteps"),
            "step_goal":            s.get("dailyStepGoal"),
            "distance_meters":      s.get("totalDistanceMeters"),
            "active_calories":      s.get("activeKilocalories"),
            "total_calories":       s.get("totalKilocalories"),
            "floors_ascended":      s.get("floorsAscended"),
            "floors_descended":     s.get("floorsDescended"),
            "active_time_seconds":  s.get("activeSeconds"),
            "sedentary_seconds":    s.get("sedentarySeconds"),
            "stress_avg":           s.get("averageStressLevel"),
            "stress_rest":          s.get("restStressPercentage"),
            "body_battery_high":    s.get("bodyBatteryHighestValue"),
            "body_battery_low":     s.get("bodyBatteryLowestValue"),
            "spo2_avg":             s.get("averageSpo2"),
            "spo2_min":             s.get("lowestSpo2"),
            "hydration_ml":         s.get("totalFluidIntakeInOz"),
            "resting_hr":           s.get("restingHeartRate"),
            "min_hr_day":           s.get("minHeartRate"),
            "max_hr_day":           s.get("maxHeartRate"),
        }
    except Exception as e:
        log.warning(f"Daily summary fetch failed for {ds}: {e}")
        return None


def fetch_sleep(d: date) -> dict | None:
    ds = _date_str(d)
    try:
        data = client.get_sleep_data(ds)
        if not data or "dailySleepDTO" not in data:
            return None
        s = data["dailySleepDTO"]
        start_ms = s.get("sleepStartTimestampGMT")
        end_ms   = s.get("sleepEndTimestampGMT")
        score    = (s.get("sleepScores") or {}).get("overall", {}).get("value")
        return {
            "date":             d,
            "start_time":       datetime.fromtimestamp(start_ms / 1000, tz=timezone.utc) if start_ms else None,
            "end_time":         datetime.fromtimestamp(end_ms   / 1000, tz=timezone.utc) if end_ms   else None,
            "duration_seconds": s.get("sleepTimeSeconds"),
            "light_seconds":    s.get("lightSleepSeconds"),
            "deep_seconds":     s.get("deepSleepSeconds"),
            "rem_seconds":      s.get("remSleepSeconds"),
            "awake_seconds":    s.get("awakeSleepSeconds"),
            "sleep_score":      score,
            "avg_spo2":         s.get("averageSpO2Value"),
            "avg_respiration":  s.get("averageRespirationValue"),
        }
    except Exception as e:
        log.warning(f"Sleep fetch failed for {ds}: {e}")
        return None


def fetch_hrv(d: date) -> dict | None:
    ds = _date_str(d)
    try:
        data = client.get_hrv_data(ds)
        if not data:
            return None
        summary = data.get("hrvSummary") or {}
        return {
            "date":                 d,
            "hrv_weekly_avg":       summary.get("weeklyAvg"),
            "hrv_last_night":       summary.get("lastNight"),
            "hrv_last_night_5min":  summary.get("lastNight5MinHigh"),
            "hrv_status":           summary.get("status"),
        }
    except Exception as e:
        log.warning(f"HRV fetch failed for {ds}: {e}")
        return None


def fetch_activities(start: date, end: date) -> list[dict]:
    try:
        activities = client.get_activities_by_date(_date_str(start), _date_str(end))
        if not activities:
            return []
        result = []
        for a in activities:
            dist     = a.get("distance")
            duration = a.get("duration")
            pace     = None
            if dist and duration and dist > 0:
                pace = duration / (dist / 1000)

            result.append({
                "activity_id":          a.get("activityId"),
                "start_time":           a.get("startTimeGMT"),
                "activity_type":        (a.get("activityType") or {}).get("typeKey", "").upper(),
                "name":                 a.get("activityName"),
                "duration_seconds":     int(duration) if duration else None,
                "distance_meters":      dist,
                "avg_hr":               a.get("averageHR"),
                "max_hr":               a.get("maxHR"),
                "calories":             a.get("calories"),
                "avg_pace_sec_per_km":  pace,
                "aerobic_te":           a.get("aerobicTrainingEffect"),
                "anaerobic_te":         a.get("anaerobicTrainingEffect"),
                "start_lat":            a.get("startLatitude"),
                "start_lng":            a.get("startLongitude"),
                "end_lat":              a.get("endLatitude"),
                "end_lng":              a.get("endLongitude"),
                "elevation_gain_m":     a.get("elevationGain"),
                "avg_speed_mps":        a.get("averageSpeed"),
                "avg_cadence":          a.get("averageRunningCadenceInStepsPerMinute") or a.get("averageCadence"),
                "avg_power":            a.get("averagePower"),
            })
        return result
    except Exception as e:
        log.warning(f"Activities fetch failed: {e}")
        return []


# ─── GPS helpers ───────────────────────────────────────────────────────────────

def extract_polyline(details: dict) -> list | None:
    descriptors = {d["metricsIndex"]: d["key"] for d in details.get("metricDescriptors", [])}
    lat_idx = next((i for i, k in descriptors.items() if k == "directLatitude"), None)
    lng_idx = next((i for i, k in descriptors.items() if k == "directLongitude"), None)
    spd_idx = next((i for i, k in descriptors.items() if k == "directSpeed"), None)
    if lat_idx is None or lng_idx is None:
        return None
    points = []
    for sample in details.get("activityDetailMetrics", []):
        m = sample.get("metrics", [])
        if lat_idx < len(m) and lng_idx < len(m):
            lat, lng = m[lat_idx], m[lng_idx]
            if lat and lng and abs(lat) > 0.001:
                spd = m[spd_idx] if (spd_idx is not None and spd_idx < len(m)) else None
                points.append([round(lat, 6), round(lng, 6), spd])
    if len(points) > 600:
        step = max(1, len(points) // 600)
        points = points[::step]
    return points if len(points) >= 3 else None


# Activity types that can have GPS routes — only these are worth retrying
OUTDOOR_TYPES = (
    'RUNNING', 'TRAIL_RUNNING', 'CYCLING', 'MOUNTAIN_BIKING', 'VIRTUAL_RIDE',
    'HIKING', 'WALKING', 'SWIMMING', 'OPEN_WATER_SWIMMING', 'MULTISPORT',
    'TRIATHLON', 'RESORT_SKIING_SNOWBOARDING', 'BACKCOUNTRY_SKIING',
    'STAND_UP_PADDLEBOARDING', 'ROWING', 'OTHER',
)


def sync_missing_gps(conn, max_fetch: int = GPS_BATCH_SIZE):
    """Fetch GPS polylines for outdoor activities that don't have one yet.

    Stores NULL (not []) when no track is found so the activity is retried
    next cycle — handles transient Garmin API failures automatically.
    Only processes outdoor activity types to avoid retrying gym/indoor sessions.
    """
    placeholders = ','.join(['%s'] * len(OUTDOOR_TYPES))
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT COUNT(*) FROM activities
            WHERE polyline IS NULL
              AND start_lat IS NOT NULL
              AND activity_type IN ({placeholders})
        """, OUTDOOR_TYPES)
        total_pending = cur.fetchone()[0]
        cur.execute(f"""
            SELECT activity_id FROM activities
            WHERE polyline IS NULL
              AND start_lat IS NOT NULL
              AND activity_type IN ({placeholders})
            ORDER BY start_time DESC
            LIMIT %s
        """, (*OUTDOOR_TYPES, max_fetch))
        ids = [r[0] for r in cur.fetchall()]
    if not ids:
        log.info("GPS: all outdoor polylines up to date.")
        return
    remaining_after = max(0, total_pending - len(ids))
    log.info(f"GPS: fetching {len(ids)} polylines ({remaining_after} still pending after this batch) ...")
    stored = 0
    for aid in ids:
        try:
            details = client.get_activity_details(aid, maxpoly=4000)
            polyline = extract_polyline(details)
            # Store NULL if no track found — will be retried next cycle
            db.upsert_activity_gps(conn, aid, polyline)
            if polyline:
                stored += 1
            time.sleep(0.5)
        except Exception as e:
            log.warning(f"GPS fetch failed for {aid}: {e}")
    log.info(f"GPS: stored {stored}/{len(ids)} polylines — {remaining_after} still pending")


# ─── Sync loop ─────────────────────────────────────────────────────────────────

CHUNK_DAYS = 30   # save to DB every N days during backfill


def sync_range(start: date, end: date):
    """Sync all data types for a date range, saving in 30-day chunks."""
    total_days = (end - start).days + 1
    is_large_backfill = total_days > 30
    log.info(f"Syncing {start} → {end} ({total_days} days)...")

    chunk_start = start
    total_saved = {"daily": 0, "sleep": 0, "hrv": 0, "activities": 0}

    while chunk_start <= end:
        chunk_end = min(chunk_start + timedelta(days=CHUNK_DAYS - 1), end)
        conn = db.get_conn()

        daily_rows, sleep_rows, hrv_rows = [], [], []
        d = chunk_start
        while d <= chunk_end:
            row = fetch_daily_summary(d)
            if row:
                daily_rows.append(row)
            row = fetch_sleep(d)
            if row:
                sleep_rows.append(row)
            row = fetch_hrv(d)
            if row:
                hrv_rows.append(row)
            d += timedelta(days=1)
            if is_large_backfill:
                time.sleep(0.4)

        activity_rows = fetch_activities(chunk_start, chunk_end)

        db.upsert_daily_summary(conn, daily_rows)
        db.upsert_sleep(conn, sleep_rows)
        db.upsert_hrv(conn, hrv_rows)
        db.upsert_activities(conn, activity_rows)
        conn.close()

        total_saved["daily"]      += len(daily_rows)
        total_saved["sleep"]      += len(sleep_rows)
        total_saved["hrv"]        += len(hrv_rows)
        total_saved["activities"] += len(activity_rows)
        log.info(
            f"Chunk {chunk_start} → {chunk_end} saved — "
            f"daily:{len(daily_rows)} sleep:{len(sleep_rows)} "
            f"hrv:{len(hrv_rows)} activities:{len(activity_rows)}"
        )
        chunk_start = chunk_end + timedelta(days=1)

    log.info(
        f"Done — total daily:{total_saved['daily']} sleep:{total_saved['sleep']} "
        f"hrv:{total_saved['hrv']} activities:{total_saved['activities']}"
    )


def ensure_schema():
    """Apply any missing columns so sync never fails on a stale schema."""
    conn = db.get_conn()
    with conn.cursor() as cur:
        cur.execute("""
            ALTER TABLE activities
                ADD COLUMN IF NOT EXISTS end_lat          DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS end_lng          DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS start_lat        DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS start_lng        DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS elevation_gain_m FLOAT,
                ADD COLUMN IF NOT EXISTS avg_speed_mps    FLOAT,
                ADD COLUMN IF NOT EXISTS avg_cadence      INTEGER,
                ADD COLUMN IF NOT EXISTS avg_power        INTEGER,
                ADD COLUMN IF NOT EXISTS polyline         JSONB;
            ALTER TABLE daily_summary
                ADD COLUMN IF NOT EXISTS min_hr_day INTEGER,
                ADD COLUMN IF NOT EXISTS max_hr_day INTEGER
        """)
    conn.commit()
    conn.close()
    log.info("Schema check done.")


def get_latest_synced_date() -> date | None:
    """Return the latest date that has real data in the DB, or None if DB is empty."""
    try:
        conn = db.get_conn()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT GREATEST(
                    (SELECT MAX(date) FROM daily_summary WHERE steps IS NOT NULL),
                    (SELECT MAX(date) FROM sleep       WHERE duration_seconds IS NOT NULL)
                )
            """)
            row = cur.fetchone()
        conn.close()
        return row[0] if row else None
    except Exception:
        return None


def main():
    login()
    ensure_schema()

    while True:
        today = date.today()
        latest = get_latest_synced_date()

        if latest is None:
            start = today - timedelta(days=BACKFILL_DAYS)
            log.info(f"Empty DB — backfilling {BACKFILL_DAYS} days from {start}.")
        else:
            # Overlap 7 days to catch any late-arriving or corrected data
            start = latest - timedelta(days=7)
            log.info(f"Incremental sync from {start} (DB latest: {latest}).")

        sync_range(start, today)
        conn = db.get_conn()
        sync_missing_gps(conn)
        conn.close()
        log.info(f"Sleeping {INTERVAL}s until next sync...")
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
