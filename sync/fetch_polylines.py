"""
Fetch GPS polylines (with speed data) for all activities that have start_lat.
Stores each point as [lat, lng, speed_mps] — speed may be null if not available.
Run: docker compose exec sync python fetch_polylines.py
"""
import os, time, json, logging
from pathlib import Path
from dotenv import load_dotenv
from garminconnect import Garmin
import db

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

TOKEN_DIR = str(Path("/root/.garth").resolve())
client = Garmin(email=os.getenv("GARMIN_EMAIL"), password=os.getenv("GARMIN_PASSWORD"))
client.login(tokenstore=TOKEN_DIR)
log.info("Logged in.")

conn = db.get_conn()
with conn.cursor() as cur:
    cur.execute("""
        SELECT activity_id FROM activities
        WHERE start_lat IS NOT NULL
        ORDER BY start_time DESC
    """)
    ids = [r[0] for r in cur.fetchall()]
conn.close()

log.info(f"{len(ids)} activities to process")


def extract_polyline(details):
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


stored = 0
skipped = 0
for i, aid in enumerate(ids):
    try:
        details = client.get_activity_details(aid, maxpoly=4000)
        polyline = extract_polyline(details)
        conn = db.get_conn()
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE activities SET polyline = %s WHERE activity_id = %s",
                (json.dumps(polyline) if polyline else None, aid),
            )
        conn.commit()
        conn.close()
        if polyline:
            stored += 1
        else:
            skipped += 1
        if (i + 1) % 10 == 0:
            log.info(f"Progress: {i+1}/{len(ids)} — {stored} routes stored, {skipped} no GPS")
        time.sleep(0.4)
    except Exception as e:
        log.warning(f"Failed {aid}: {e}")

log.info(f"Done. {stored} polylines stored, {skipped} activities had no GPS track.")
