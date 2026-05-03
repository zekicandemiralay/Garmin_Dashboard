"""
Garmin → PostgreSQL Sync Service
─────────────────────────────────
Multi-user: reads all users with Garmin credentials from the DB,
syncs each one independently every SYNC_INTERVAL_SECONDS seconds.
"""

import os
import json
import time
import logging
from datetime import date, timedelta, datetime, timezone
from pathlib import Path

import bcrypt
from cryptography.fernet import Fernet
from dotenv import load_dotenv
from garminconnect import Garmin

import db

try:
    import reverse_geocoder as rg
    HAS_GEOCODER = True
except ImportError:
    HAS_GEOCODER = False

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

BACKFILL_DAYS  = int(os.getenv("SYNC_BACKFILL_DAYS", 3650))
INTERVAL       = int(os.getenv("SYNC_INTERVAL_SECONDS", 3600))
GPS_BATCH_SIZE = int(os.getenv("GPS_BATCH_SIZE", 50))
SECRET_KEY     = os.getenv("SECRET_KEY", "").encode()

# Per-call Garmin client — set before each user's sync
client: Garmin = None


# ─── Fernet helpers ───────────────────────────────────────────────────────────

_fernet: Fernet | None = None

def get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        if not SECRET_KEY:
            raise RuntimeError("SECRET_KEY env var is not set")
        _fernet = Fernet(SECRET_KEY)
    return _fernet

def decrypt_credential(ciphertext: bytes) -> str:
    return get_fernet().decrypt(bytes(ciphertext)).decode()

def encrypt_credential(plaintext: str) -> bytes:
    return get_fernet().encrypt(plaintext.encode())


# ─── Per-user Garmin login ────────────────────────────────────────────────────

def get_token_dir(user_id: int) -> str:
    """Return per-user garth token directory. User 1 falls back to root for backward compat."""
    if user_id == 1:
        root = Path("/root/.garth")
        root.mkdir(parents=True, exist_ok=True)
        return str(root)
    path = Path(f"/root/.garth/{user_id}")
    path.mkdir(parents=True, exist_ok=True)
    return str(path)


def login_user(user_id: int, email: str, password: str) -> Garmin | None:
    token_dir = get_token_dir(user_id)
    garmin = Garmin(email=email, password=password)
    try:
        mfa_status, _ = garmin.login(tokenstore=token_dir)
        if mfa_status:
            log.warning(f"User {user_id}: MFA required — skipping")
            return None
        log.info(f"User {user_id}: Garmin session ready")
        return garmin
    except Exception as e:
        log.warning(f"User {user_id}: Garmin login failed — {e}")
        return None


def get_users_with_credentials() -> list[dict]:
    """Return all users that have encrypted Garmin credentials stored."""
    try:
        conn = db.get_conn()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, garmin_email_enc, garmin_pass_enc FROM users "
                "WHERE garmin_email_enc IS NOT NULL AND garmin_pass_enc IS NOT NULL"
            )
            rows = cur.fetchall()
        conn.close()
        result = []
        for row in rows:
            try:
                result.append({
                    "id":       row[0],
                    "email":    decrypt_credential(row[1]),
                    "password": decrypt_credential(row[2]),
                })
            except Exception as e:
                log.warning(f"Failed to decrypt credentials for user {row[0]}: {e}")
        return result
    except Exception as e:
        log.warning(f"Failed to fetch users: {e}")
        return []


# ─── Schema + migration ───────────────────────────────────────────────────────

def ensure_schema():
    """
    Idempotent schema migration. Handles:
    - Fresh installs (creates all tables with correct PKs)
    - Existing single-user installs (adds user_id, migrates PKs, backfills data)
    """
    conn = db.get_conn()
    try:
        with conn.cursor() as cur:
            # 1. Users table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id               SERIAL PRIMARY KEY,
                    username         TEXT UNIQUE NOT NULL,
                    password_hash    TEXT NOT NULL,
                    is_admin         BOOLEAN DEFAULT FALSE,
                    garmin_email_enc BYTEA,
                    garmin_pass_enc  BYTEA,
                    created_at       TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            conn.commit()

            # 2. Default admin if users table is empty
            cur.execute("SELECT COUNT(*) FROM users")
            if cur.fetchone()[0] == 0:
                hashed = bcrypt.hashpw(b"admin", bcrypt.gensalt()).decode()
                cur.execute(
                    "INSERT INTO users (username, password_hash, is_admin) VALUES (%s, %s, TRUE) RETURNING id",
                    ("admin", hashed),
                )
                admin_id = cur.fetchone()[0]
                conn.commit()
                log.warning("=" * 60)
                log.warning("Created default admin user: admin / admin")
                log.warning("CHANGE THIS PASSWORD immediately after first login!")
                log.warning("=" * 60)
            else:
                cur.execute("SELECT id FROM users WHERE is_admin = TRUE ORDER BY id LIMIT 1")
                row = cur.fetchone()
                admin_id = row[0] if row else 1

            # 3. Activity/health column additions (existing migrations)
            cur.execute("""
                ALTER TABLE activities
                    ADD COLUMN IF NOT EXISTS end_lat           DOUBLE PRECISION,
                    ADD COLUMN IF NOT EXISTS end_lng           DOUBLE PRECISION,
                    ADD COLUMN IF NOT EXISTS start_lat         DOUBLE PRECISION,
                    ADD COLUMN IF NOT EXISTS start_lng         DOUBLE PRECISION,
                    ADD COLUMN IF NOT EXISTS elevation_gain_m  FLOAT,
                    ADD COLUMN IF NOT EXISTS avg_speed_mps     FLOAT,
                    ADD COLUMN IF NOT EXISTS avg_cadence       INTEGER,
                    ADD COLUMN IF NOT EXISTS avg_power         INTEGER,
                    ADD COLUMN IF NOT EXISTS polyline          JSONB,
                    ADD COLUMN IF NOT EXISTS country           VARCHAR(10),
                    ADD COLUMN IF NOT EXISTS weather_data      JSONB,
                    ADD COLUMN IF NOT EXISTS country_crossings JSONB;
                ALTER TABLE daily_summary
                    ADD COLUMN IF NOT EXISTS min_hr_day INTEGER,
                    ADD COLUMN IF NOT EXISTS max_hr_day INTEGER
            """)
            conn.commit()

            # 4. Tours tables
            cur.execute("""
                CREATE TABLE IF NOT EXISTS tours (
                    id          SERIAL PRIMARY KEY,
                    name        TEXT NOT NULL,
                    description TEXT,
                    created_at  TIMESTAMPTZ DEFAULT NOW(),
                    updated_at  TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS tour_activities (
                    tour_id     INT REFERENCES tours(id) ON DELETE CASCADE,
                    activity_id BIGINT,
                    PRIMARY KEY (tour_id, activity_id)
                )
            """)
            conn.commit()

            # 5. Add user_id columns (nullable first for migration safety)
            for table in ("daily_summary", "sleep", "hrv", "activities", "tours"):
                cur.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS user_id INT")
            conn.commit()

            # 6. Backfill existing rows with admin_id
            for table in ("daily_summary", "sleep", "hrv", "activities", "tours"):
                cur.execute(f"UPDATE {table} SET user_id = %s WHERE user_id IS NULL", (admin_id,))
            conn.commit()

            # 7. Migrate PKs to composite (user_id + natural key)
            # Check by looking for user_id in the existing PK columns
            migrations = [
                ("daily_summary", "daily_summary_pkey", "user_id, date"),
                ("sleep",         "sleep_pkey",         "user_id, date"),
                ("hrv",           "hrv_pkey",           "user_id, date"),
                ("activities",    "activities_pkey",    "user_id, activity_id"),
            ]
            for table, pkey_name, new_pk in migrations:
                cur.execute("""
                    SELECT COUNT(*) FROM information_schema.key_column_usage
                    WHERE table_name = %s AND column_name = 'user_id'
                    AND constraint_name = (
                        SELECT constraint_name FROM information_schema.table_constraints
                        WHERE table_name = %s AND constraint_type = 'PRIMARY KEY' LIMIT 1
                    )
                """, (table, table))
                already_composite = cur.fetchone()[0] > 0
                if not already_composite:
                    cur.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {pkey_name}")
                    cur.execute(f"ALTER TABLE {table} ALTER COLUMN user_id SET NOT NULL")
                    cur.execute(f"ALTER TABLE {table} ADD PRIMARY KEY ({new_pk})")
            conn.commit()

            # 8. tours user_id FK (after users table exists)
            cur.execute("""
                DO $$ BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'tours' AND column_name = 'user_id'
                        AND is_nullable = 'NO'
                    ) THEN
                        ALTER TABLE tours ALTER COLUMN user_id SET NOT NULL;
                    END IF;
                END $$
            """)
            conn.commit()

            # 9. Migrate GARMIN_EMAIL/PASSWORD env vars → admin user (backward compat)
            _migrate_env_credentials(conn, admin_id)

        log.info("Schema check done.")
    finally:
        conn.close()


def _migrate_env_credentials(conn, admin_id: int):
    """If env vars are set and admin has no credentials yet, encrypt and store them."""
    email    = os.getenv("GARMIN_EMAIL")
    password = os.getenv("GARMIN_PASSWORD")
    if not email or not password:
        return
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT garmin_email_enc FROM users WHERE id = %s",
                (admin_id,),
            )
            row = cur.fetchone()
            if row and row[0] is None:
                cur.execute(
                    "UPDATE users SET garmin_email_enc = %s, garmin_pass_enc = %s WHERE id = %s",
                    (encrypt_credential(email), encrypt_credential(password), admin_id),
                )
                conn.commit()
                log.info("Migrated GARMIN_EMAIL/GARMIN_PASSWORD env vars to admin user credentials in DB")
    except Exception as e:
        log.warning(f"Credential migration failed: {e}")


# ─── Date helpers ──────────────────────────────────────────────────────────────

def _date_str(d: date) -> str:
    return d.strftime("%Y-%m-%d")


def get_latest_synced_date(user_id: int) -> date | None:
    try:
        conn = db.get_conn()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT GREATEST(
                    (SELECT MAX(date) FROM daily_summary WHERE steps IS NOT NULL AND user_id = %s),
                    (SELECT MAX(date) FROM sleep WHERE duration_seconds IS NOT NULL AND user_id = %s)
                )
            """, (user_id, user_id))
            row = cur.fetchone()
        conn.close()
        return row[0] if row else None
    except Exception:
        return None


def get_earliest_synced_date(user_id: int) -> date | None:
    try:
        conn = db.get_conn()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT MIN(date) FROM daily_summary WHERE steps IS NOT NULL AND user_id = %s",
                (user_id,),
            )
            row = cur.fetchone()
        conn.close()
        return row[0] if row else None
    except Exception:
        return None


# ─── Fetch helpers (use module-level `client`) ────────────────────────────────

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
            "date":                d,
            "hrv_weekly_avg":      summary.get("weeklyAvg"),
            "hrv_last_night":      summary.get("lastNight"),
            "hrv_last_night_5min": summary.get("lastNight5MinHigh"),
            "hrv_status":          summary.get("status"),
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
                "activity_id":         a.get("activityId"),
                "start_time":          a.get("startTimeGMT"),
                "activity_type":       (a.get("activityType") or {}).get("typeKey", "").upper(),
                "name":                a.get("activityName"),
                "duration_seconds":    int(duration) if duration else None,
                "distance_meters":     dist,
                "avg_hr":              a.get("averageHR"),
                "max_hr":              a.get("maxHR"),
                "calories":            a.get("calories"),
                "avg_pace_sec_per_km": pace,
                "aerobic_te":          a.get("aerobicTrainingEffect"),
                "anaerobic_te":        a.get("anaerobicTrainingEffect"),
                "start_lat":           a.get("startLatitude"),
                "start_lng":           a.get("startLongitude"),
                "end_lat":             a.get("endLatitude"),
                "end_lng":             a.get("endLongitude"),
                "elevation_gain_m":    a.get("elevationGain"),
                "avg_speed_mps":       a.get("averageSpeed"),
                "avg_cadence":         a.get("averageRunningCadenceInStepsPerMinute") or a.get("averageCadence"),
                "avg_power":           a.get("averagePower"),
            })
        return result
    except Exception as e:
        log.warning(f"Activities fetch failed: {e}")
        return []


# ─── GPS helpers ──────────────────────────────────────────────────────────────

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


OUTDOOR_TYPES = (
    'RUNNING', 'TRAIL_RUNNING', 'CYCLING', 'MOUNTAIN_BIKING', 'VIRTUAL_RIDE',
    'HIKING', 'WALKING', 'SWIMMING', 'OPEN_WATER_SWIMMING', 'MULTISPORT',
    'TRIATHLON', 'RESORT_SKIING_SNOWBOARDING', 'BACKCOUNTRY_SKIING',
    'STAND_UP_PADDLEBOARDING', 'ROWING', 'OTHER',
)


def sync_missing_gps(conn, user_id: int, max_fetch: int = GPS_BATCH_SIZE) -> int:
    placeholders = ','.join(['%s'] * len(OUTDOOR_TYPES))
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT COUNT(*) FROM activities
            WHERE polyline IS NULL AND start_lat IS NOT NULL AND user_id = %s
              AND activity_type IN ({placeholders})
        """, (user_id, *OUTDOOR_TYPES))
        total_pending = cur.fetchone()[0]
        cur.execute(f"""
            SELECT activity_id FROM activities
            WHERE polyline IS NULL AND start_lat IS NOT NULL AND user_id = %s
              AND activity_type IN ({placeholders})
            ORDER BY start_time DESC LIMIT %s
        """, (user_id, *OUTDOOR_TYPES, max_fetch))
        ids = [r[0] for r in cur.fetchall()]
    if not ids:
        log.info(f"User {user_id} GPS: all outdoor polylines up to date.")
        return 0
    remaining_after = max(0, total_pending - len(ids))
    log.info(f"User {user_id} GPS: fetching {len(ids)} polylines ({remaining_after} still pending) ...")
    stored = 0
    for aid in ids:
        try:
            details = client.get_activity_details(aid, maxpoly=4000)
            polyline = extract_polyline(details)
            db.upsert_activity_gps(conn, aid, polyline, user_id)
            if polyline:
                stored += 1
            time.sleep(0.5)
        except Exception as e:
            log.warning(f"GPS fetch failed for {aid}: {e}")
    log.info(f"User {user_id} GPS: stored {stored}/{len(ids)} — {remaining_after} still pending")
    return remaining_after


def sync_missing_coords(conn, user_id: int, chunk_days: int = 30):
    placeholders = ','.join(['%s'] * len(OUTDOOR_TYPES))
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT MIN(start_time::date), COUNT(*)
            FROM activities
            WHERE start_lat IS NULL AND user_id = %s
              AND activity_type IN ({placeholders})
        """, (user_id, *OUTDOOR_TYPES))
        row = cur.fetchone()
    if not row or not row[0]:
        return
    oldest_missing, total_missing = row[0], row[1]
    chunk_end = min(oldest_missing + timedelta(days=chunk_days - 1), date.today())
    log.info(f"User {user_id} Coords: {total_missing} missing — re-fetching {oldest_missing} → {chunk_end}")
    activity_rows = fetch_activities(oldest_missing, chunk_end)
    if activity_rows:
        db.upsert_activities(conn, activity_rows, user_id)


# ─── Sync range ───────────────────────────────────────────────────────────────

CHUNK_DAYS = 30


def sync_range(start: date, end: date, user_id: int):
    total_days = (end - start).days + 1
    is_large_backfill = total_days > 30
    log.info(f"User {user_id}: syncing {start} → {end} ({total_days} days)...")

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

        db.upsert_daily_summary(conn, daily_rows, user_id)
        db.upsert_sleep(conn, sleep_rows, user_id)
        db.upsert_hrv(conn, hrv_rows, user_id)
        db.upsert_activities(conn, activity_rows, user_id)
        conn.close()

        total_saved["daily"]      += len(daily_rows)
        total_saved["sleep"]      += len(sleep_rows)
        total_saved["hrv"]        += len(hrv_rows)
        total_saved["activities"] += len(activity_rows)
        chunk_start = chunk_end + timedelta(days=1)

    log.info(
        f"User {user_id}: done — daily:{total_saved['daily']} sleep:{total_saved['sleep']} "
        f"hrv:{total_saved['hrv']} activities:{total_saved['activities']}"
    )


def sync_historical_gap(user_id: int):
    backfill_start = date.today() - timedelta(days=BACKFILL_DAYS)
    earliest = get_earliest_synced_date(user_id)
    if earliest is None or earliest <= backfill_start + timedelta(days=1):
        return
    chunk_end   = earliest - timedelta(days=1)
    chunk_start = max(backfill_start, chunk_end - timedelta(days=29))
    log.info(f"User {user_id}: history gap — backfilling {chunk_start} → {chunk_end}")
    sync_range(chunk_start, chunk_end, user_id)


# ─── Enrichment ───────────────────────────────────────────────────────────────

def populate_missing_countries(conn, user_id: int):
    if not HAS_GEOCODER:
        return
    with conn.cursor() as cur:
        cur.execute("""
            SELECT activity_id, start_lat, start_lng FROM activities
            WHERE start_lat IS NOT NULL AND country IS NULL AND user_id = %s
            LIMIT 500
        """, (user_id,))
        rows = cur.fetchall()
    if not rows:
        return
    coords  = [(r[1], r[2]) for r in rows]
    results = rg.search(coords, mode=1)
    updates = [(res.get('cc', '??'), row[0]) for row, res in zip(rows, results)]
    with conn.cursor() as cur:
        for country_code, activity_id in updates:
            cur.execute(
                "UPDATE activities SET country = %s WHERE activity_id = %s AND user_id = %s",
                (country_code, activity_id, user_id),
            )
    conn.commit()
    log.info(f"User {user_id} Countries: tagged {len(updates)} activities")


def compute_country_crossings(conn, user_id: int):
    if not HAS_GEOCODER:
        return
    placeholders = ','.join(['%s'] * len(OUTDOOR_TYPES))
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT activity_id, polyline FROM activities
            WHERE polyline IS NOT NULL AND country_crossings IS NULL
              AND user_id = %s AND activity_type IN ({placeholders})
            LIMIT 50
        """, (user_id, *OUTDOOR_TYPES))
        rows = cur.fetchall()
    if not rows:
        return
    updated = 0
    for row in rows:
        try:
            polyline = row[1] if isinstance(row[1], list) else json.loads(row[1])
            if not polyline or len(polyline) < 2:
                crossings = []
            else:
                step    = max(1, len(polyline) // 60)
                samples = polyline[::step]
                coords  = [(p[0], p[1]) for p in samples]
                results = rg.search(coords, mode=1)
                crossings, prev_cc = [], None
                for pt, res in zip(samples, results):
                    cc = res.get("cc", "??")
                    if prev_cc and cc != prev_cc:
                        crossings.append({"lat": pt[0], "lng": pt[1], "from": prev_cc, "to": cc})
                    prev_cc = cc
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE activities SET country_crossings = %s WHERE activity_id = %s AND user_id = %s",
                    (json.dumps(crossings), row[0], user_id),
                )
            conn.commit()
            updated += 1
        except Exception as e:
            log.warning(f"Crossings failed for {row[0]}: {e}")
    if updated:
        log.info(f"User {user_id} Crossings: computed for {updated} activities")


WEATHER_FIELDS      = "temperature_2m,precipitation,wind_speed_10m,wind_direction_10m,weather_code,relative_humidity_2m"
ARCHIVE_CUTOFF_DAYS = 5


def _weather_url(lat: float, lng: float, ds: str, use_archive: bool) -> str:
    base = "archive-api.open-meteo.com/v1/archive" if use_archive else "api.open-meteo.com/v1/forecast"
    return (
        f"https://{base}"
        f"?latitude={lat:.4f}&longitude={lng:.4f}"
        f"&start_date={ds}&end_date={ds}"
        f"&hourly={WEATHER_FIELDS}"
        f"&timezone=auto"
    )


def fetch_weather_for_activities(conn, user_id: int):
    import requests as req
    archive_cutoff = date.today() - timedelta(days=ARCHIVE_CUTOFF_DAYS)
    placeholders   = ','.join(['%s'] * len(OUTDOOR_TYPES))
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT activity_id, start_time::date, start_lat, start_lng
            FROM activities
            WHERE start_lat IS NOT NULL AND weather_data IS NULL AND user_id = %s
              AND activity_type IN ({placeholders})
            ORDER BY start_time DESC LIMIT 20
        """, (user_id, *OUTDOOR_TYPES))
        rows = cur.fetchall()
    if not rows:
        return
    updated = 0
    for row in rows:
        try:
            act_date    = row[1]
            ds          = str(act_date)
            use_archive = act_date <= archive_cutoff
            url         = _weather_url(row[2], row[3], ds, use_archive)
            resp        = req.get(url, timeout=15)
            if resp.status_code == 200:
                data = resp.json().get("hourly", {})
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE activities SET weather_data = %s WHERE activity_id = %s AND user_id = %s",
                        (json.dumps(data), row[0], user_id),
                    )
                conn.commit()
                updated += 1
            elif resp.status_code == 400 and not use_archive:
                pass
            time.sleep(0.3)
        except Exception as e:
            log.warning(f"Weather fetch failed for activity {row[0]}: {e}")
    if updated:
        log.info(f"User {user_id} Weather: fetched data for {updated} activities")


# ─── Per-user sync ────────────────────────────────────────────────────────────

def sync_user(garmin_client: Garmin, user_id: int):
    global client
    client = garmin_client

    today  = date.today()
    latest = get_latest_synced_date(user_id)

    if latest is None:
        start = today - timedelta(days=BACKFILL_DAYS)
        log.info(f"User {user_id}: empty DB — backfilling {BACKFILL_DAYS} days from {start}")
    else:
        start = latest - timedelta(days=7)
        log.info(f"User {user_id}: incremental sync from {start} (DB latest: {latest})")

    sync_range(start, today, user_id)
    sync_historical_gap(user_id)

    conn = db.get_conn()
    sync_missing_coords(conn, user_id)
    while True:
        conn.close()
        conn = db.get_conn()
        remaining = sync_missing_gps(conn, user_id)
        if remaining == 0:
            break
    populate_missing_countries(conn, user_id)
    compute_country_crossings(conn, user_id)
    fetch_weather_for_activities(conn, user_id)
    conn.close()


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    ensure_schema()

    while True:
        users = get_users_with_credentials()
        if not users:
            log.warning("No users with Garmin credentials found. "
                        "Log in and set credentials via the dashboard Settings.")
        for user in users:
            log.info(f"--- Syncing user {user['id']} ---")
            garmin_client = login_user(user["id"], user["email"], user["password"])
            if garmin_client is None:
                continue
            try:
                sync_user(garmin_client, user["id"])
            except Exception as e:
                log.error(f"User {user['id']} sync failed: {e}", exc_info=True)

        log.info(f"All users synced. Sleeping {INTERVAL}s until next cycle...")
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
