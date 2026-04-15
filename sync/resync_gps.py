"""
One-shot script: re-fetches all activities from Garmin to populate
start_lat/start_lng/end_lat/end_lng, then fills in polylines.
Run inside the sync container:
  docker compose exec sync python resync_gps.py
"""
import os, time, logging
from datetime import date, timedelta
from pathlib import Path
from dotenv import load_dotenv
from garminconnect import Garmin
import db

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

TOKEN_DIR = str(Path("/root/.garth").resolve())

client = Garmin(email=os.getenv("GARMIN_EMAIL"), password=os.getenv("GARMIN_PASSWORD"))
mfa, _ = client.login(tokenstore=TOKEN_DIR)
if mfa:
    raise RuntimeError("MFA required")
log.info("Logged in.")

conn = db.get_conn()
with conn.cursor() as cur:
    cur.execute("SELECT MIN(start_time::date), MAX(start_time::date) FROM activities")
    row = cur.fetchone()
    earliest, latest = row[0], row[1]
conn.close()

log.info(f"Activities span {earliest} → {latest}")

# Re-fetch activities in 30-day chunks to get GPS fields
chunk = timedelta(days=30)
d = earliest
total = 0
while d <= latest:
    end = min(d + chunk - timedelta(days=1), latest)
    try:
        acts = client.get_activities_by_date(d.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d"))
        if acts:
            rows = []
            for a in acts:
                dist = a.get("distance")
                dur  = a.get("duration")
                pace = (dur / (dist / 1000)) if dist and dur and dist > 0 else None
                rows.append({
                    "activity_id":         a.get("activityId"),
                    "start_time":          a.get("startTimeGMT"),
                    "activity_type":       (a.get("activityType") or {}).get("typeKey", "").upper(),
                    "name":                a.get("activityName"),
                    "duration_seconds":    int(dur) if dur else None,
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
            conn = db.get_conn()
            db.upsert_activities(conn, rows)
            conn.close()
            total += len(rows)
            log.info(f"Chunk {d} → {end}: updated {len(rows)} activities (total so far: {total})")
    except Exception as e:
        log.warning(f"Chunk {d} → {end} failed: {e}")
    d = end + timedelta(days=1)
    time.sleep(0.5)

log.info(f"Activity re-sync done. {total} total updated.")

# Now fetch polylines for activities that have GPS coords but no polyline
from sync import extract_polyline, sync_missing_gps
conn = db.get_conn()
with conn.cursor() as cur:
    cur.execute("SELECT COUNT(*) FROM activities WHERE start_lat IS NOT NULL AND polyline IS NULL")
    pending = cur.fetchone()[0]
log.info(f"{pending} activities need polylines — fetching up to 200 now ...")

with conn.cursor() as cur:
    cur.execute("""
        SELECT activity_id FROM activities
        WHERE polyline IS NULL AND start_lat IS NOT NULL
        ORDER BY start_time DESC
        LIMIT 200
    """)
    ids = [r[0] for r in cur.fetchall()]

stored = 0
for aid in ids:
    try:
        details = client.get_activity_details(aid, maxpollen=1000)
        polyline = extract_polyline(details)
        db.upsert_activity_gps(conn, aid, polyline or [])
        if polyline:
            stored += 1
        time.sleep(0.4)
    except Exception as e:
        log.warning(f"Polyline failed for {aid}: {e}")

conn.close()
log.info(f"Done. {stored}/{len(ids)} polylines stored.")
