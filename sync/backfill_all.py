"""
Full backfill: sync missing historical data, fix missing coords, fetch missing polylines.
Run once to catch up immediately without waiting for hourly cycles.

  docker-compose exec sync python backfill_all.py
"""
import time, json, logging
from datetime import date, timedelta
from dotenv import load_dotenv
import db
import sync as sync_module
from sync import extract_polyline, fetch_activities, OUTDOOR_TYPES, ensure_schema, sync_range

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

# ── Login — sets sync.client used by fetch_activities/extract_polyline ─────────
sync_module.login()
client = sync_module.client
log.info("Logged in.")

conn = db.get_conn()
ensure_schema()
conn.close()

# ── Phase 0: sync all missing historical data ──────────────────────────────────
log.info("=== Phase 0: checking for missing historical data ===")
conn = db.get_conn()
with conn.cursor() as cur:
    cur.execute("SELECT MIN(date) FROM daily_summary WHERE steps IS NOT NULL")
    row = cur.fetchone()
conn.close()

today = date.today()
backfill_start = today - timedelta(days=3650)
earliest_in_db = row[0] if row and row[0] else None

if earliest_in_db is None:
    log.info("Phase 0: DB empty — nothing to backfill historically.")
elif earliest_in_db > backfill_start + timedelta(days=1):
    hist_end = earliest_in_db - timedelta(days=1)
    log.info(f"Phase 0: DB starts at {earliest_in_db}, syncing {backfill_start} → {hist_end} ...")
    sync_range(backfill_start, hist_end)
    log.info("Phase 0 done.")
else:
    log.info(f"Phase 0 done — no historical gap (DB goes back to {earliest_in_db}).")

# ── Phase 1: fix all missing start coordinates ─────────────────────────────────
log.info("=== Phase 1: filling missing GPS coordinates ===")
placeholders = ','.join(['%s'] * len(OUTDOOR_TYPES))
CHUNK = 30

prev_remaining = None
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

    if remaining == prev_remaining:
        log.warning(f"  No progress — {remaining} activities still have no GPS after re-fetch. "
                    "They likely have no GPS track in Garmin. Moving on.")
        break
    prev_remaining = remaining

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
