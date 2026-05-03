"""
Garmin Dashboard — FastAPI Backend
"""

from datetime import date, timedelta
from typing import Optional, List

from fastapi import FastAPI, Query, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import db
from auth import (
    get_current_user, require_admin,
    hash_password, verify_password,
    encrypt_credential, decrypt_credential,
    create_token,
)

app = FastAPI(title="Garmin Dashboard API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def default_range() -> tuple[date, date]:
    end = date.today()
    start = end - timedelta(days=30)
    return start, end


# ─── Health (public) ──────────────────────────────────────────────────────────

@app.get("/health")
def health():
    try:
        with db.cursor() as cur:
            cur.execute("SELECT 1")
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


# ─── Auth ─────────────────────────────────────────────────────────────────────

class LoginBody(BaseModel):
    username: str
    password: str


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str


class GarminCredentialsBody(BaseModel):
    email: str
    password: str


@app.post("/auth/login")
def login(body: LoginBody):
    with db.cursor() as cur:
        cur.execute(
            "SELECT id, password_hash, is_admin FROM users WHERE username = %s",
            (body.username,),
        )
        user = cur.fetchone()
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_token(user["id"], user["is_admin"])
    return {"token": token, "is_admin": user["is_admin"]}


@app.get("/auth/me")
def get_me(user: dict = Depends(get_current_user)):
    with db.cursor() as cur:
        cur.execute(
            "SELECT id, username, is_admin, garmin_email_enc IS NOT NULL AS has_garmin FROM users WHERE id = %s",
            (user["id"],),
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return {"id": row["id"], "username": row["username"], "is_admin": row["is_admin"], "has_garmin": row["has_garmin"]}


@app.put("/auth/me/password")
def change_password(body: ChangePasswordBody, user: dict = Depends(get_current_user)):
    with db.cursor() as cur:
        cur.execute("SELECT password_hash FROM users WHERE id = %s", (user["id"],))
        row = cur.fetchone()
    if not row or not verify_password(body.current_password, row["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    with db.cursor() as cur:
        cur.execute(
            "UPDATE users SET password_hash = %s WHERE id = %s",
            (hash_password(body.new_password), user["id"]),
        )
    return {"ok": True}


@app.put("/auth/me/garmin")
def set_garmin_credentials(body: GarminCredentialsBody, user: dict = Depends(get_current_user)):
    """Store encrypted Garmin credentials. Values are never returned by any endpoint."""
    with db.cursor() as cur:
        cur.execute(
            "UPDATE users SET garmin_email_enc = %s, garmin_pass_enc = %s WHERE id = %s",
            (encrypt_credential(body.email), encrypt_credential(body.password), user["id"]),
        )
    return {"ok": True}


# ─── Admin: user management ───────────────────────────────────────────────────

class CreateUserBody(BaseModel):
    username: str
    password: str
    is_admin: bool = False


@app.get("/api/admin/users")
def list_users(admin: dict = Depends(require_admin)):
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT u.id, u.username, u.is_admin,
                   u.garmin_email_enc IS NOT NULL AS has_garmin,
                   u.created_at,
                   COUNT(DISTINCT a.activity_id)::int AS activity_count
            FROM users u
            LEFT JOIN activities a ON a.user_id = u.id
            GROUP BY u.id
            ORDER BY u.created_at ASC
            """
        )
        return cur.fetchall()


@app.post("/api/admin/users", status_code=201)
def create_user(body: CreateUserBody, admin: dict = Depends(require_admin)):
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    with db.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE username = %s", (body.username,))
        if cur.fetchone():
            raise HTTPException(status_code=409, detail="Username already exists")
        cur.execute(
            "INSERT INTO users (username, password_hash, is_admin) VALUES (%s, %s, %s) RETURNING id",
            (body.username, hash_password(body.password), body.is_admin),
        )
        return {"id": cur.fetchone()["id"]}


@app.delete("/api/admin/users/{user_id}", status_code=204)
def delete_user(user_id: int, admin: dict = Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    with db.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE id = %s", (user_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="User not found")
        # cascade-delete all user data
        for table in ("daily_summary", "sleep", "hrv", "activities", "tours"):
            cur.execute(f"DELETE FROM {table} WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))


# ─── Data bounds ──────────────────────────────────────────────────────────────

@app.get("/api/range")
def get_range(user: dict = Depends(get_current_user)):
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT
                LEAST(
                    (SELECT MIN(date) FROM daily_summary WHERE steps IS NOT NULL AND user_id = %s),
                    (SELECT MIN(date) FROM sleep WHERE duration_seconds IS NOT NULL AND user_id = %s)
                ) AS earliest,
                GREATEST(
                    (SELECT MAX(date) FROM daily_summary WHERE steps IS NOT NULL AND user_id = %s),
                    (SELECT MAX(date) FROM sleep WHERE duration_seconds IS NOT NULL AND user_id = %s)
                ) AS latest
            """,
            (user["id"], user["id"], user["id"], user["id"]),
        )
        row = cur.fetchone()
    return {"earliest": row["earliest"], "latest": row["latest"]}


# ─── Daily summary ────────────────────────────────────────────────────────────

@app.get("/api/daily")
def get_daily(
    start: Optional[date] = Query(default=None),
    end:   Optional[date] = Query(default=None),
    user:  dict = Depends(get_current_user),
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
            WHERE date BETWEEN %s AND %s AND user_id = %s
            ORDER BY date ASC
            """,
            (start, end, user["id"]),
        )
        return cur.fetchall()


# ─── Sleep ────────────────────────────────────────────────────────────────────

@app.get("/api/sleep")
def get_sleep(
    start: Optional[date] = Query(default=None),
    end:   Optional[date] = Query(default=None),
    user:  dict = Depends(get_current_user),
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
            WHERE date BETWEEN %s AND %s AND user_id = %s
            ORDER BY date ASC
            """,
            (start, end, user["id"]),
        )
        return cur.fetchall()


# ─── HRV ──────────────────────────────────────────────────────────────────────

@app.get("/api/hrv")
def get_hrv(
    start: Optional[date] = Query(default=None),
    end:   Optional[date] = Query(default=None),
    user:  dict = Depends(get_current_user),
):
    if start is None or end is None:
        start, end = default_range()
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT date, hrv_weekly_avg, hrv_last_night,
                   hrv_last_night_5min, hrv_status
            FROM hrv
            WHERE date BETWEEN %s AND %s AND user_id = %s
            ORDER BY date ASC
            """,
            (start, end, user["id"]),
        )
        return cur.fetchall()


# ─── Activities ───────────────────────────────────────────────────────────────

@app.get("/api/activities/map")
def get_activities_map(
    start: Optional[date] = Query(default=None),
    end:   Optional[date] = Query(default=None),
    user:  dict = Depends(get_current_user),
):
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
            WHERE start_time::date BETWEEN %s AND %s AND user_id = %s
            ORDER BY start_time DESC
            LIMIT 1000
            """,
            (start, end, user["id"]),
        )
        return cur.fetchall()


@app.get("/api/activities")
def get_activities(
    start:         Optional[date] = Query(default=None),
    end:           Optional[date] = Query(default=None),
    activity_type: Optional[str]  = Query(default=None),
    user:          dict = Depends(get_current_user),
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
                WHERE start_time::date BETWEEN %s AND %s AND user_id = %s AND activity_type = %s
                ORDER BY start_time ASC
                """,
                (start, end, user["id"], activity_type.upper()),
            )
        else:
            cur.execute(
                """
                SELECT activity_id, start_time, activity_type, name,
                       duration_seconds, distance_meters, avg_hr, max_hr,
                       calories, avg_pace_sec_per_km, aerobic_te, anaerobic_te,
                       start_lat, start_lng, elevation_gain_m, avg_speed_mps, avg_cadence, avg_power
                FROM activities
                WHERE start_time::date BETWEEN %s AND %s AND user_id = %s
                ORDER BY start_time ASC
                """,
                (start, end, user["id"]),
            )
        return cur.fetchall()


# ─── Touring ──────────────────────────────────────────────────────────────────

@app.get("/api/touring")
def get_touring(
    start: Optional[date] = Query(default=None),
    end:   Optional[date] = Query(default=None),
    user:  dict = Depends(get_current_user),
):
    if start is None or end is None:
        start, end = default_range()
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT activity_id, start_time, activity_type, name,
                   duration_seconds, distance_meters, elevation_gain_m, avg_speed_mps,
                   avg_hr, avg_pace_sec_per_km, calories,
                   start_lat, start_lng, end_lat, end_lng,
                   polyline, weather_data, country_crossings, country
            FROM activities
            WHERE start_time::date BETWEEN %s AND %s
              AND user_id = %s
              AND polyline IS NOT NULL
              AND start_lat IS NOT NULL
            ORDER BY start_time ASC
            """,
            (start, end, user["id"]),
        )
        activities = cur.fetchall()
        cur.execute(
            """
            SELECT date, start_time, end_time, duration_seconds, sleep_score, avg_spo2
            FROM sleep
            WHERE date BETWEEN %s AND %s AND user_id = %s
            ORDER BY date ASC
            """,
            (start, end, user["id"]),
        )
        sleep = cur.fetchall()
    return {"activities": activities, "sleep": sleep}


# ─── Country statistics ───────────────────────────────────────────────────────

@app.get("/api/activities/countries")
def get_country_stats(
    start: Optional[date] = Query(default=None),
    end:   Optional[date] = Query(default=None),
    user:  dict = Depends(get_current_user),
):
    if start is None or end is None:
        start = date(2000, 1, 1)
        end   = date.today()
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT
                country,
                activity_type,
                COUNT(*)                                                                   AS count,
                ROUND((COALESCE(SUM(distance_meters), 0) / 1000.0)::numeric, 1)::float   AS total_km,
                ROUND((COALESCE(SUM(duration_seconds), 0) / 3600.0)::numeric, 1)::float  AS total_hours,
                ROUND(COALESCE(SUM(elevation_gain_m), 0)::numeric)::int                  AS total_elevation_m,
                ROUND(AVG(avg_hr)::numeric)::int                                          AS avg_hr
            FROM activities
            WHERE start_time::date BETWEEN %s AND %s
              AND user_id = %s
              AND country IS NOT NULL
            GROUP BY country, activity_type
            ORDER BY country, total_km DESC NULLS LAST
            """,
            (start, end, user["id"]),
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
        countries[c]["total_km"]          = round(countries[c]["total_km"] + (row["total_km"] or 0), 1)
        countries[c]["total_hours"]       = round(countries[c]["total_hours"] + (row["total_hours"] or 0), 1)
        countries[c]["total_elevation_m"] += row["total_elevation_m"] or 0

    return sorted(countries.values(), key=lambda x: x["total_km"], reverse=True)


# ─── Summary ──────────────────────────────────────────────────────────────────

@app.get("/api/summary")
def get_summary(user: dict = Depends(get_current_user)):
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
            WHERE date BETWEEN %s AND %s AND user_id = %s
            """,
            (day7, today, user["id"]),
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
            WHERE date BETWEEN %s AND %s AND user_id = %s
            """,
            (day7, today, user["id"]),
        )
        sleep_7d = cur.fetchone()

        cur.execute(
            """
            SELECT
                ROUND(AVG(hrv_last_night))::int AS avg_hrv,
                ROUND(AVG(hrv_weekly_avg))::int AS avg_hrv_weekly
            FROM hrv
            WHERE date BETWEEN %s AND %s AND user_id = %s
            """,
            (day7, today, user["id"]),
        )
        hrv_7d = cur.fetchone()

        cur.execute(
            "SELECT COUNT(*) AS count FROM activities WHERE start_time::date BETWEEN %s AND %s AND user_id = %s",
            (day7, today, user["id"]),
        )
        activities_7d = cur.fetchone()

        cur.execute(
            "SELECT COUNT(*) AS count FROM activities WHERE start_time::date BETWEEN %s AND %s AND user_id = %s",
            (day30, today, user["id"]),
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


# ─── Tours ────────────────────────────────────────────────────────────────────

class TourCreate(BaseModel):
    name: str
    description: Optional[str] = None
    activity_ids: List[int]


class TourUpdate(BaseModel):
    name: str
    description: Optional[str] = None


@app.get("/api/tours")
def list_tours(user: dict = Depends(get_current_user)):
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT t.id, t.name, t.description, t.created_at,
                   COUNT(ta.activity_id)::int AS activity_count,
                   ROUND((COALESCE(SUM(a.distance_meters), 0) / 1000.0)::numeric, 1)::float AS total_km,
                   MIN(a.start_time::date)::text AS start_date,
                   MAX(a.start_time::date)::text AS end_date
            FROM tours t
            LEFT JOIN tour_activities ta ON ta.tour_id = t.id
            LEFT JOIN activities a ON a.activity_id = ta.activity_id AND a.user_id = t.user_id
            WHERE t.user_id = %s
            GROUP BY t.id
            ORDER BY t.created_at DESC
            """,
            (user["id"],),
        )
        return cur.fetchall()


@app.post("/api/tours", status_code=201)
def create_tour(body: TourCreate, user: dict = Depends(get_current_user)):
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO tours (name, description, user_id) VALUES (%s, %s, %s) RETURNING id",
            (body.name, body.description, user["id"]),
        )
        tour_id = cur.fetchone()["id"]
        for aid in body.activity_ids:
            cur.execute(
                "INSERT INTO tour_activities (tour_id, activity_id) VALUES (%s, %s)",
                (tour_id, aid),
            )
    return {"id": tour_id}


@app.get("/api/tours/{tour_id}")
def get_tour(tour_id: int, user: dict = Depends(get_current_user)):
    with db.cursor() as cur:
        cur.execute(
            "SELECT id, name, description, created_at FROM tours WHERE id = %s AND user_id = %s",
            (tour_id, user["id"]),
        )
        tour = cur.fetchone()
        if not tour:
            raise HTTPException(status_code=404, detail="Tour not found")

        cur.execute(
            """
            SELECT a.activity_id, a.start_time, a.activity_type, a.name,
                   a.duration_seconds, a.distance_meters, a.elevation_gain_m, a.avg_speed_mps,
                   a.avg_hr, a.avg_pace_sec_per_km, a.calories,
                   a.start_lat, a.start_lng, a.end_lat, a.end_lng,
                   a.polyline, a.weather_data, a.country_crossings, a.country
            FROM activities a
            JOIN tour_activities ta ON ta.activity_id = a.activity_id
            WHERE ta.tour_id = %s AND a.user_id = %s
            ORDER BY a.start_time ASC
            """,
            (tour_id, user["id"]),
        )
        activities = cur.fetchall()

        if activities:
            dates = [a["start_time"].date() for a in activities]
            cur.execute(
                """
                SELECT date, start_time, end_time, duration_seconds, sleep_score, avg_spo2
                FROM sleep WHERE date BETWEEN %s AND %s AND user_id = %s ORDER BY date ASC
                """,
                (min(dates), max(dates), user["id"]),
            )
            sleep = cur.fetchall()
        else:
            sleep = []

    return {"tour": tour, "activities": activities, "sleep": sleep}


@app.put("/api/tours/{tour_id}")
def update_tour(tour_id: int, body: TourUpdate, user: dict = Depends(get_current_user)):
    with db.cursor() as cur:
        cur.execute(
            "UPDATE tours SET name = %s, description = %s, updated_at = NOW() WHERE id = %s AND user_id = %s",
            (body.name, body.description, tour_id, user["id"]),
        )
    return {"ok": True}


@app.delete("/api/tours/{tour_id}", status_code=204)
def delete_tour(tour_id: int, user: dict = Depends(get_current_user)):
    with db.cursor() as cur:
        cur.execute("DELETE FROM tours WHERE id = %s AND user_id = %s", (tour_id, user["id"]))
