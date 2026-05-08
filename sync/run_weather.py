"""
Manual trigger for ERA5 grid and RainViewer radar sync.
Run inside the sync container:

    docker-compose exec sync python run_weather.py          # both
    docker-compose exec sync python run_weather.py era5
    docker-compose exec sync python run_weather.py radar
"""
import json
import sys
import time
import logging
from datetime import timezone

import db
import weather as wx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

mode = sys.argv[1] if len(sys.argv) > 1 else "both"


def run_era5():
    conn = db.get_conn()
    activities = db.get_activities_needing_era5(conn, limit=20)
    if not activities:
        log.info("ERA5: no activities need grid data")
        conn.close()
        return
    log.info(f"ERA5: processing {len(activities)} activities")
    for act in activities:
        try:
            polyline = act["polyline"] if isinstance(act["polyline"], list) else json.loads(act["polyline"])
            if not polyline or len(polyline) < 2:
                db.mark_activity_grid_fetched(conn, act["user_id"], act["activity_id"])
                continue

            min_lat, max_lat, min_lng, max_lng = wx.grid_bbox(polyline)

            if db.grid_exists_for_area(conn, min_lat, max_lat, min_lng, max_lng, act["date"]):
                log.info(f"ERA5: activity {act['activity_id']} — grid already exists, marking done")
                db.mark_activity_grid_fetched(conn, act["user_id"], act["activity_id"])
                continue

            grid_data = wx.fetch_era5_grid(polyline, act["date"])
            rows = wx.era5_to_rows(grid_data, act["date"])
            if rows:
                db.upsert_weather_grid(conn, rows)
                log.info(f"ERA5: stored {len(rows)} grid rows for activity {act['activity_id']}")
            db.mark_activity_grid_fetched(conn, act["user_id"], act["activity_id"])
        except Exception as e:
            log.warning(f"ERA5: activity {act['activity_id']} failed: {e}")
    conn.close()


def run_radar():
    conn = db.get_conn()
    frames = wx.fetch_rainviewer_frames()
    if not frames:
        log.info("Radar: no frames from RainViewer")
        conn.close()
        return

    # Use a large window so we catch everything with a polyline and no timestamps
    activities = db.get_recent_activities_for_radar(conn, sync_window_hours=72)
    if not activities:
        log.info("Radar: no activities need radar data")
        conn.close()
        return

    log.info(f"Radar: checking {len(activities)} activities against {len(frames)} frames")
    total_tiles = 0
    for act in activities:
        try:
            polyline = act["polyline"] if isinstance(act["polyline"], list) else json.loads(act["polyline"])
            if not polyline:
                continue

            start_time = act["start_time"]
            if start_time.tzinfo is None:
                start_time = start_time.replace(tzinfo=timezone.utc)

            matching = wx.frames_for_activity(frames, start_time, act["duration_seconds"])
            if not matching:
                log.info(f"Radar: activity {act['activity_id']} — no overlapping frames")
                db.update_activity_radar_timestamps(conn, act["user_id"], act["activity_id"], [])
                continue

            tiles = wx.tiles_for_polyline(polyline, wx.RADAR_ZOOM)
            saved_ts = []
            for frame in matching:
                ts_saved = True
                for (x, y) in tiles:
                    if db.radar_tile_exists(conn, frame["timestamp"], wx.RADAR_ZOOM, x, y):
                        continue
                    data = wx.download_tile(frame["host"], frame["path"], wx.RADAR_ZOOM, x, y)
                    if data:
                        db.upsert_radar_tile(conn, frame["timestamp"], wx.RADAR_ZOOM, x, y, data)
                        total_tiles += 1
                    else:
                        ts_saved = False
                    time.sleep(0.05)
                if ts_saved:
                    saved_ts.append(frame["timestamp"])

            db.update_activity_radar_timestamps(conn, act["user_id"], act["activity_id"], saved_ts)
            log.info(f"Radar: activity {act['activity_id']} — {len(saved_ts)} frames, {len(tiles)} tiles each")
        except Exception as e:
            log.warning(f"Radar: activity {act['activity_id']} failed: {e}")

    log.info(f"Radar: done — {total_tiles} new tiles downloaded")
    conn.close()


if mode in ("era5", "both"):
    run_era5()
if mode in ("radar", "both"):
    run_radar()
