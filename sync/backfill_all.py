"""
Full backfill: fix all missing coordinates then all missing polylines.
Run once to catch up immediately without waiting for hourly cycles.

  docker-compose exec sync python backfill_all.py
"""
import os, time, json, logging
from datetime import date, timedelta
from pathlib import Path
from dotenv import load_dotenv
from garminconnect import Garmin
import db
from sync import (
    extract_polyline, fetch_activities,
    OUTDOOR_TYPES, ensure_schema,
    TOKEN_DIR, GARMIN_EMAIL, GARMIN_PASSWORD,
)

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

# ── Login ──────────────────────────────────────────────────────────────────────
client = Garmin(email=GARMIN_EMAIL, password=GARMIN_PASSWORD)
client.login(tokenstore=TOKEN_DIR)
log.info("Logged in.")

conn = db.get_conn()
ensure_schema()
conn.close()

# ── Phase 1: fix all missing start coordinates ─────────────────────────────────
log.info("=== Phase 1: filling missing GPS coordinates ===")
placeholders = ','.join(['%s'] * len(OUTDOOR_TYPES))
CHUNK = 30

while True:
    conn = db.get_conn()
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT MIN(start_time::date), COUNT(*)
            FROM activities
            WHERE start_lat IS NULL
              AND activity_type IN ({placeholders})
        """, OUTDOOR_TYPES)
        row = cur.fetchone()
    conn.close()

    if not row or not row[0]:
        log.info("Phase 1 done — no more missing coordinates.")
        break

    oldest, remaining = row[0], row[1]
    chunk_end = min(oldest + timedelta(days=CHUNK - 1), date.today())
    log.info(f"Re-fetching {oldest} → {chunk_end}  ({remaining} still missing) ...")

    rows = fetch_activities(oldest, chunk_end)
    if rows:
        conn = db.get_conn()
        db.upsert_activities(conn, rows)
        conn.close()
        log.info(f"  Updated {len(rows)} activities")
    time.sleep(0.5)

# ── Phase 2: fetch all missing polylines ───────────────────────────────────────
log.info("=== Phase 2: fetching missing polylines ===")

conn = db.get_conn()
with conn.cursor() as cur:
    cur.execute(f"""
        SELECT activity_id FROM activities
        WHERE polyline IS NULL
          AND start_lat IS NOT NULL
          AND activity_type IN ({placeholders})
        ORDER BY start_time DESC
    """, OUTDOOR_TYPES)
    ids = [r[0] for r in cur.fetchall()]
conn.close()

log.info(f"{len(ids)} polylines to fetch")
stored = skipped = 0

for i, aid in enumerate(ids):
    try:
        details = client.get_activity_details(aid, maxpoly=4000)
        polyline = extract_polyline(details)
        conn = db.get_conn()
        db.upsert_activity_gps(conn, aid, polyline)
        conn.close()
        if polyline:
            stored += 1
        else:
            skipped += 1
        if (i + 1) % 20 == 0:
            log.info(f"  Progress: {i+1}/{len(ids)} — {stored} routes stored, {skipped} no track")
        time.sleep(0.4)
    except Exception as e:
        log.warning(f"  Failed {aid}: {e}")

log.info(f"=== Done. {stored} polylines stored, {skipped} had no GPS track ===")
