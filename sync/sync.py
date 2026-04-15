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
            })
        return result
    except Exception as e:
        log.warning(f"Activities fetch failed: {e}")
        return []


# ─── Sync loop ─────────────────────────────────────────────────────────────────

def sync_range(start: date, end: date):
    """Sync all data types for a date range."""
    conn = db.get_conn()
    log.info(f"Syncing {start} → {end} ...")

    daily_rows, sleep_rows, hrv_rows = [], [], []

    total_days = (end - start).days + 1
    is_large_backfill = total_days > 30

    d = start
    while d <= end:
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
        # Throttle large backfills to avoid rate-limiting
        if is_large_backfill:
            time.sleep(0.4)

    activity_rows = fetch_activities(start, end)

    db.upsert_daily_summary(conn, daily_rows)
    db.upsert_sleep(conn, sleep_rows)
    db.upsert_hrv(conn, hrv_rows)
    db.upsert_activities(conn, activity_rows)

    log.info(
        f"Saved — daily:{len(daily_rows)} sleep:{len(sleep_rows)} "
        f"hrv:{len(hrv_rows)} activities:{len(activity_rows)}"
    )
    conn.close()


def main():
    login()
    first_run = True

    while True:
        today = date.today()

        if first_run:
            start = today - timedelta(days=BACKFILL_DAYS)
            log.info(f"First run — backfilling {BACKFILL_DAYS} days from {start}.")
            first_run = False
        else:
            start = today - timedelta(days=2)

        sync_range(start, today)
        log.info(f"Sleeping {INTERVAL}s until next sync...")
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
