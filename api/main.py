"""
Garmin Dashboard — FastAPI Backend
────────────────────────────────────
REST endpoints that serve data from the PostgreSQL database.
All date range params default to the last 30 days.
"""

from datetime import date, timedelta
from typing import Optional

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware

import db

app = FastAPI(title="Garmin Dashboard API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this once frontend is deployed
    allow_methods=["GET"],
    allow_headers=["*"],
)


def default_range() -> tuple[date, date]:
    end = date.today()
    start = end - timedelta(days=30)
    return start, end


# ─── Data bounds ──────────────────────────────────────────────────────────────

@app.get("/api/range")
def get_range():
    """Return the earliest and latest dates available in the database."""
    with db.cursor() as cur:
        cur.execute("""
            SELECT
                LEAST(
                    (SELECT MIN(date) FROM daily_summary WHERE steps IS NOT NULL),
                    (SELECT MIN(date) FROM sleep       WHERE duration_seconds IS NOT NULL)
                ) AS earliest,
                GREATEST(
                    (SELECT MAX(date) FROM daily_summary WHERE steps IS NOT NULL),
                    (SELECT MAX(date) FROM sleep       WHERE duration_seconds IS NOT NULL)
                ) AS latest
        """)
        row = cur.fetchone()
    return {"earliest": row["earliest"], "latest": row["latest"]}


# ─── Health ──────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    try:
        with db.cursor() as cur:
            cur.execute("SELECT 1")
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


# ─── Daily summary ───────────────────────────────────────────────────────────

@app.get("/api/daily")
def get_daily(
    start: Optional[date] = Query(default=None),
    end:   Optional[date] = Query(default=None),
):
    if start is None or end is None:
        start, end = default_range()
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT date, steps, step_goal, distance_meters,
                   active_calories, total_calories,
                   floors_ascended, floors_descended,
                   active_time_seconds, sedentary_seconds,
                   stress_avg, stress_rest,
                   body_battery_high, body_battery_low,
                   spo2_avg, spo2_min, hydration_ml,
                   resting_hr, min_hr_day, max_hr_day
            FROM daily_summary
            WHERE date BETWEEN %s AND %s
            ORDER BY date ASC
            """,
            (start, end),
        )
        return cur.fetchall()


# ─── Sleep ───────────────────────────────────────────────────────────────────

@app.get("/api/sleep")
def get_sleep(
    start: Optional[date] = Query(default=None),
    end:   Optional[date] = Query(default=None),
):
    if start is None or end is None:
        start, end = default_range()
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT date, start_time, end_time, duration_seconds,
                   light_seconds, deep_seconds, rem_seconds, awake_seconds,
                   sleep_score, avg_spo2, avg_respiration
            FROM sleep
            WHERE date BETWEEN %s AND %s
            ORDER BY date ASC
            """,
            (start, end),
        )
        return cur.fetchall()


# ─── HRV ─────────────────────────────────────────────────────────────────────

@app.get("/api/hrv")
def get_hrv(
    start: Optional[date] = Query(default=None),
    end:   Optional[date] = Query(default=None),
):
    if start is None or end is None:
        start, end = default_range()
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT date, hrv_weekly_avg, hrv_last_night,
                   hrv_last_night_5min, hrv_status
            FROM hrv
            WHERE date BETWEEN %s AND %s
            ORDER BY date ASC
            """,
            (start, end),
        )
        return cur.fetchall()


# ─── Activities ───────────────────────────────────────────────────────────────

@app.get("/api/activities/map")
def get_activities_map(
    start: Optional[date] = Query(default=None),
    end:   Optional[date] = Query(default=None),
):
    """Activities with GPS data (dots + polylines) for the map view."""
    if start is None or end is None:
        start, end = default_range()
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT activity_id, start_time, activity_type, name,
                   duration_seconds, distance_meters, avg_hr, calories,
                   avg_pace_sec_per_km, elevation_gain_m,
                   start_lat, start_lng, end_lat, end_lng, polyline
            FROM activities
            WHERE start_time::date BETWEEN %s AND %s
            ORDER BY start_time DESC
            LIMIT 1000
            """,
            (start, end),
        )
        return cur.fetchall()


@app.get("/api/activities")
def get_activities(
    start: Optional[date] = Query(default=None),
    end:   Optional[date] = Query(default=None),
    activity_type: Optional[str] = Query(default=None, description="e.g. RUNNING, CYCLING"),
):
    if start is None or end is None:
        start, end = default_range()
    with db.cursor() as cur:
        if activity_type:
            cur.execute(
                """
                SELECT activity_id, start_time, activity_type, name,
                       duration_seconds, distance_meters, avg_hr, max_hr,
                       calories, avg_pace_sec_per_km, aerobic_te, anaerobic_te,
                       start_lat, start_lng, elevation_gain_m, avg_speed_mps, avg_cadence, avg_power
                FROM activities
                WHERE start_time::date BETWEEN %s AND %s
                  AND activity_type = %s
                ORDER BY start_time ASC
                """,
                (start, end, activity_type.upper()),
            )
        else:
            cur.execute(
                """
                SELECT activity_id, start_time, activity_type, name,
                       duration_seconds, distance_meters, avg_hr, max_hr,
                       calories, avg_pace_sec_per_km, aerobic_te, anaerobic_te,
                       start_lat, start_lng, elevation_gain_m, avg_speed_mps, avg_cadence, avg_power
                FROM activities
                WHERE start_time::date BETWEEN %s AND %s
                ORDER BY start_time ASC
                """,
                (start, end),
            )
        return cur.fetchall()


# ─── Touring ─────────────────────────────────────────────────────────────────

@app.get("/api/touring")
def get_touring(
    start: Optional[date] = Query(default=None),
    end:   Optional[date] = Query(default=None),
):
    """Activities with polylines, weather, and country crossings for the touring tab."""
    if start is None or end is None:
        start, end = default_range()
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT activity_id, start_time, activity_type, name,
                   duration_seconds, distance_meters, elevation_gain_m, avg_speed_mps,
                   start_lat, start_lng, end_lat, end_lng,
                   polyline, weather_data, country_crossings, country
            FROM activities
            WHERE start_time::date BETWEEN %s AND %s
              AND polyline IS NOT NULL
              AND start_lat IS NOT NULL
            ORDER BY start_time ASC
            """,
            (start, end),
        )
        activities = cur.fetchall()
        cur.execute(
            """
            SELECT date, start_time, end_time, duration_seconds, sleep_score, avg_spo2
            FROM sleep WHERE date BETWEEN %s AND %s ORDER BY date ASC
            """,
            (start, end),
        )
        sleep = cur.fetchall()
    return {"activities": activities, "sleep": sleep}


# ─── Country statistics ───────────────────────────────────────────────────────

@app.get("/api/activities/countries")
def get_country_stats(
    start: Optional[date] = Query(default=None),
    end:   Optional[date] = Query(default=None),
):
    """Activity statistics grouped by country (ISO2) and type, sorted by total distance."""
    if start is None or end is None:
        start = date(2000, 1, 1)
        end   = date.today()
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT
                country,
                activity_type,
                COUNT(*)                                                    AS count,
                ROUND((COALESCE(SUM(distance_meters), 0) / 1000.0)::numeric, 1)::float  AS total_km,
                ROUND((COALESCE(SUM(duration_seconds), 0) / 3600.0)::numeric, 1)::float AS total_hours,
                ROUND(COALESCE(SUM(elevation_gain_m), 0)::numeric)::int                 AS total_elevation_m,
                ROUND(AVG(avg_hr)::numeric)::int                            AS avg_hr
            FROM activities
            WHERE start_time::date BETWEEN %s AND %s
              AND country IS NOT NULL
            GROUP BY country, activity_type
            ORDER BY country, total_km DESC NULLS LAST
            """,
            (start, end),
        )
        rows = cur.fetchall()

    countries: dict = {}
    for row in rows:
        c = row["country"]
        if c not in countries:
            countries[c] = {"country": c, "total_activities": 0, "total_km": 0.0,
                            "total_hours": 0.0, "total_elevation_m": 0, "types": []}
        countries[c]["types"].append({
            "type": row["activity_type"], "count": row["count"],
            "total_km": row["total_km"], "total_hours": row["total_hours"],
            "total_elevation_m": row["total_elevation_m"], "avg_hr": row["avg_hr"],
        })
        countries[c]["total_activities"] += row["count"]
        countries[c]["total_km"]         = round(countries[c]["total_km"] + (row["total_km"] or 0), 1)
        countries[c]["total_hours"]      = round(countries[c]["total_hours"] + (row["total_hours"] or 0), 1)
        countries[c]["total_elevation_m"] += row["total_elevation_m"] or 0

    return sorted(countries.values(), key=lambda x: x["total_km"], reverse=True)


# ─── Summary (overview card for dashboard) ───────────────────────────────────

@app.get("/api/summary")
def get_summary():
    """7-day and 30-day averages for the main health metrics."""
    today = date.today()
    day7  = today - timedelta(days=7)
    day30 = today - timedelta(days=30)

    with db.cursor() as cur:
        cur.execute(
            """
            SELECT
                ROUND(AVG(steps))::int             AS avg_steps,
                ROUND(AVG(resting_hr))::int        AS avg_resting_hr,
                ROUND(AVG(body_battery_high))::int AS avg_bb_high,
                ROUND(AVG(body_battery_low))::int  AS avg_bb_low,
                ROUND(AVG(stress_avg))::int        AS avg_stress,
                ROUND(AVG(spo2_avg)::numeric, 1)::float AS avg_spo2
            FROM daily_summary
            WHERE date BETWEEN %s AND %s
            """,
            (day7, today),
        )
        daily_7d = cur.fetchone()

        cur.execute(
            """
            SELECT
                ROUND(AVG(duration_seconds) / 3600.0, 2)::float AS avg_sleep_hours,
                ROUND(AVG(sleep_score))::int                     AS avg_sleep_score,
                ROUND(AVG(deep_seconds) / 60.0)::int             AS avg_deep_min,
                ROUND(AVG(rem_seconds) / 60.0)::int              AS avg_rem_min
            FROM sleep
            WHERE date BETWEEN %s AND %s
            """,
            (day7, today),
        )
        sleep_7d = cur.fetchone()

        cur.execute(
            """
            SELECT
                ROUND(AVG(hrv_last_night))::int AS avg_hrv,
                ROUND(AVG(hrv_weekly_avg))::int AS avg_hrv_weekly
            FROM hrv
            WHERE date BETWEEN %s AND %s
            """,
            (day7, today),
        )
        hrv_7d = cur.fetchone()

        cur.execute(
            "SELECT COUNT(*) AS count FROM activities WHERE start_time::date BETWEEN %s AND %s",
            (day7, today),
        )
        activities_7d = cur.fetchone()

        cur.execute(
            "SELECT COUNT(*) AS count FROM activities WHERE start_time::date BETWEEN %s AND %s",
            (day30, today),
        )
        activities_30d = cur.fetchone()

    return {
        "period_7d": {
            "daily":      daily_7d,
            "sleep":      sleep_7d,
            "hrv":        hrv_7d,
            "activities": activities_7d["count"],
        },
        "activities_30d": activities_30d["count"],
    }
