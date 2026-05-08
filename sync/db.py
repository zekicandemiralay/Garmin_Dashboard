import json
import os
import psycopg2
from psycopg2.extras import execute_values


def get_conn():
    return psycopg2.connect(
        host=os.getenv("POSTGRES_HOST", "db"),
        port=os.getenv("POSTGRES_PORT", 5432),
        dbname=os.getenv("POSTGRES_DB", "garmin"),
        user=os.getenv("POSTGRES_USER", "garmin"),
        password=os.getenv("POSTGRES_PASSWORD"),
    )


def upsert_daily_summary(conn, rows: list[dict], user_id: int):
    if not rows:
        return
    sql = """
        INSERT INTO daily_summary (
            user_id, date, steps, step_goal, distance_meters, active_calories,
            total_calories, floors_ascended, floors_descended,
            active_time_seconds, sedentary_seconds,
            stress_avg, stress_rest,
            body_battery_high, body_battery_low,
            spo2_avg, spo2_min, hydration_ml,
            resting_hr, min_hr_day, max_hr_day
        ) VALUES %s
        ON CONFLICT (user_id, date) DO UPDATE SET
            steps               = EXCLUDED.steps,
            step_goal           = EXCLUDED.step_goal,
            distance_meters     = EXCLUDED.distance_meters,
            active_calories     = EXCLUDED.active_calories,
            total_calories      = EXCLUDED.total_calories,
            floors_ascended     = EXCLUDED.floors_ascended,
            floors_descended    = EXCLUDED.floors_descended,
            active_time_seconds = EXCLUDED.active_time_seconds,
            sedentary_seconds   = EXCLUDED.sedentary_seconds,
            stress_avg          = EXCLUDED.stress_avg,
            stress_rest         = EXCLUDED.stress_rest,
            body_battery_high   = EXCLUDED.body_battery_high,
            body_battery_low    = EXCLUDED.body_battery_low,
            spo2_avg            = EXCLUDED.spo2_avg,
            spo2_min            = EXCLUDED.spo2_min,
            hydration_ml        = EXCLUDED.hydration_ml,
            resting_hr          = EXCLUDED.resting_hr,
            min_hr_day          = EXCLUDED.min_hr_day,
            max_hr_day          = EXCLUDED.max_hr_day
    """
    values = [(
        user_id, r["date"], r.get("steps"), r.get("step_goal"), r.get("distance_meters"),
        r.get("active_calories"), r.get("total_calories"),
        r.get("floors_ascended"), r.get("floors_descended"),
        r.get("active_time_seconds"), r.get("sedentary_seconds"),
        r.get("stress_avg"), r.get("stress_rest"),
        r.get("body_battery_high"), r.get("body_battery_low"),
        r.get("spo2_avg"), r.get("spo2_min"), r.get("hydration_ml"),
        r.get("resting_hr"), r.get("min_hr_day"), r.get("max_hr_day"),
    ) for r in rows]
    with conn.cursor() as cur:
        execute_values(cur, sql, values)
    conn.commit()


def upsert_sleep(conn, rows: list[dict], user_id: int):
    if not rows:
        return
    sql = """
        INSERT INTO sleep (
            user_id, date, start_time, end_time, duration_seconds,
            light_seconds, deep_seconds, rem_seconds, awake_seconds,
            sleep_score, avg_spo2, avg_respiration
        ) VALUES %s
        ON CONFLICT (user_id, date) DO UPDATE SET
            start_time       = EXCLUDED.start_time,
            end_time         = EXCLUDED.end_time,
            duration_seconds = EXCLUDED.duration_seconds,
            light_seconds    = EXCLUDED.light_seconds,
            deep_seconds     = EXCLUDED.deep_seconds,
            rem_seconds      = EXCLUDED.rem_seconds,
            awake_seconds    = EXCLUDED.awake_seconds,
            sleep_score      = EXCLUDED.sleep_score,
            avg_spo2         = EXCLUDED.avg_spo2,
            avg_respiration  = EXCLUDED.avg_respiration
    """
    values = [(
        user_id, r["date"], r.get("start_time"), r.get("end_time"),
        r.get("duration_seconds"), r.get("light_seconds"), r.get("deep_seconds"),
        r.get("rem_seconds"), r.get("awake_seconds"), r.get("sleep_score"),
        r.get("avg_spo2"), r.get("avg_respiration"),
    ) for r in rows]
    with conn.cursor() as cur:
        execute_values(cur, sql, values)
    conn.commit()


def upsert_hrv(conn, rows: list[dict], user_id: int):
    if not rows:
        return
    sql = """
        INSERT INTO hrv (
            user_id, date, hrv_weekly_avg, hrv_last_night, hrv_last_night_5min, hrv_status
        ) VALUES %s
        ON CONFLICT (user_id, date) DO UPDATE SET
            hrv_weekly_avg      = EXCLUDED.hrv_weekly_avg,
            hrv_last_night      = EXCLUDED.hrv_last_night,
            hrv_last_night_5min = EXCLUDED.hrv_last_night_5min,
            hrv_status          = EXCLUDED.hrv_status
    """
    values = [(
        user_id, r["date"], r.get("hrv_weekly_avg"), r.get("hrv_last_night"),
        r.get("hrv_last_night_5min"), r.get("hrv_status"),
    ) for r in rows]
    with conn.cursor() as cur:
        execute_values(cur, sql, values)
    conn.commit()


def upsert_activities(conn, rows: list[dict], user_id: int):
    if not rows:
        return
    sql = """
        INSERT INTO activities (
            user_id, activity_id, start_time, activity_type, name,
            duration_seconds, distance_meters, avg_hr, max_hr, calories,
            avg_pace_sec_per_km, aerobic_te, anaerobic_te,
            start_lat, start_lng, end_lat, end_lng,
            elevation_gain_m, avg_speed_mps, avg_cadence, avg_power
        ) VALUES %s
        ON CONFLICT (user_id, activity_id) DO UPDATE SET
            start_lat        = EXCLUDED.start_lat,
            start_lng        = EXCLUDED.start_lng,
            end_lat          = EXCLUDED.end_lat,
            end_lng          = EXCLUDED.end_lng,
            elevation_gain_m = EXCLUDED.elevation_gain_m,
            avg_speed_mps    = EXCLUDED.avg_speed_mps,
            avg_cadence      = EXCLUDED.avg_cadence,
            avg_power        = EXCLUDED.avg_power
    """
    values = [(
        user_id,
        r["activity_id"], r.get("start_time"), r.get("activity_type"), r.get("name"),
        r.get("duration_seconds"), r.get("distance_meters"),
        r.get("avg_hr"), r.get("max_hr"), r.get("calories"),
        r.get("avg_pace_sec_per_km"), r.get("aerobic_te"), r.get("anaerobic_te"),
        r.get("start_lat"), r.get("start_lng"), r.get("end_lat"), r.get("end_lng"),
        r.get("elevation_gain_m"), r.get("avg_speed_mps"), r.get("avg_cadence"), r.get("avg_power"),
    ) for r in rows]
    with conn.cursor() as cur:
        execute_values(cur, sql, values)
    conn.commit()


def upsert_activity_gps(conn, activity_id: int, polyline: list | None, user_id: int):
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE activities SET polyline = %s WHERE activity_id = %s AND user_id = %s",
            (json.dumps(polyline) if polyline else None, activity_id, user_id),
        )
    conn.commit()


# ─── Shared weather tables (no user_id) ──────────────────────────────────────

def upsert_weather_grid(conn, rows: list[dict]):
    if not rows:
        return
    sql = """
        INSERT INTO weather_grid_points
            (lat, lng, date, hour, temperature_2m, precipitation, wind_speed_10m, wind_direction_10m)
        VALUES %s
        ON CONFLICT (lat, lng, date, hour) DO NOTHING
    """
    values = [(
        r["lat"], r["lng"], r["date"], r["hour"],
        r.get("temperature_2m"), r.get("precipitation"),
        r.get("wind_speed_10m"), r.get("wind_direction_10m"),
    ) for r in rows]
    with conn.cursor() as cur:
        execute_values(cur, sql, values)
    conn.commit()


def upsert_radar_tile(conn, timestamp: int, z: int, x: int, y: int, tile_data: bytes):
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO weather_radar_tiles (timestamp_unix, z, x, y, tile_data)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (timestamp_unix, z, x, y) DO NOTHING
        """, (timestamp, z, x, y, tile_data))
    conn.commit()


def radar_tile_exists(conn, timestamp: int, z: int, x: int, y: int) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT 1 FROM weather_radar_tiles WHERE timestamp_unix=%s AND z=%s AND x=%s AND y=%s",
            (timestamp, z, x, y)
        )
        return cur.fetchone() is not None


def update_activity_radar_timestamps(conn, user_id: int, activity_id: int, timestamps: list[int]):
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE activities SET radar_timestamps = %s WHERE activity_id = %s AND user_id = %s",
            (timestamps or [], activity_id, user_id),
        )
    conn.commit()


def mark_activity_grid_fetched(conn, user_id: int, activity_id: int):
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE activities SET weather_grid_fetched = TRUE WHERE activity_id = %s AND user_id = %s",
            (activity_id, user_id),
        )
    conn.commit()


def grid_exists_for_area(conn, min_lat: float, max_lat: float, min_lng: float, max_lng: float, act_date) -> bool:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT 1 FROM weather_grid_points
            WHERE date = %s AND lat BETWEEN %s AND %s AND lng BETWEEN %s AND %s
            LIMIT 1
        """, (act_date, min_lat, max_lat, min_lng, max_lng))
        return cur.fetchone() is not None


def get_activities_needing_era5(conn, limit: int = 8) -> list[dict]:
    """Activities that haven't had their ERA5 grid fetched yet (cross-user)."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT activity_id, user_id, start_time::date AS act_date, polyline
            FROM activities
            WHERE polyline IS NOT NULL AND weather_grid_fetched = FALSE
            ORDER BY start_time DESC
            LIMIT %s
        """, (limit,))
        rows = cur.fetchall()
    return [{"activity_id": r[0], "user_id": r[1], "date": r[2], "polyline": r[3]} for r in rows]


def get_recent_activities_for_radar(conn, sync_window_hours: float = 3.0) -> list[dict]:
    """Activities added to the DB recently whose radar hasn't been attempted.

    Filters on created_at (when we received the data from Garmin) rather than
    start_time, so late-syncing activities still get a radar check.
    The frame-matching logic in weather.py handles the actual time overlap check.
    """
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(hours=sync_window_hours)
    with conn.cursor() as cur:
        cur.execute("""
            SELECT activity_id, user_id, start_time, duration_seconds, polyline
            FROM activities
            WHERE created_at >= %s
              AND polyline IS NOT NULL
              AND (radar_timestamps IS NULL OR cardinality(radar_timestamps) = 0)
            ORDER BY created_at DESC
            LIMIT 100
        """, (cutoff,))
        rows = cur.fetchall()
    return [{"activity_id": r[0], "user_id": r[1], "start_time": r[2],
             "duration_seconds": r[3], "polyline": r[4]} for r in rows]
