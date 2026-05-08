"""
Weather enrichment — shared across all users (no user_id in these tables).

ERA5 grid:   Open-Meteo hourly data for a grid of points around each activity.
Radar tiles: RainViewer radar PNG tiles downloaded while still in the ~2h window.
"""

import json
import math
import time
import logging
from datetime import date, datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

log = logging.getLogger(__name__)

ARCHIVE_CUTOFF_DAYS = 5
GRID_RESOLUTION     = 0.25   # degrees — matches ERA5 native grid
GRID_BUFFER         = 1.5    # degrees of padding beyond activity bbox
RADAR_ZOOM          = 6      # tile zoom for radar download (~156km/tile)
RADAR_WINDOW_HOURS  = 2.5    # how far back RainViewer keeps data
ERA5_FIELDS         = "temperature_2m,precipitation,wind_speed_10m,wind_direction_10m"
RAINVIEWER_API      = "https://api.rainviewer.com/public/weather-maps.json"


# ─── Tile math ────────────────────────────────────────────────────────────────

def lat_lng_to_tile(lat: float, lng: float, zoom: int) -> tuple[int, int]:
    n   = 2 ** zoom
    x   = int((lng + 180) / 360 * n)
    r   = math.radians(lat)
    y   = int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n)
    return x, max(0, min(n - 1, y))


def tiles_for_polyline(polyline: list, zoom: int, pad: int = 1) -> set[tuple[int, int]]:
    if not polyline:
        return set()
    lats = [p[0] for p in polyline]
    lngs = [p[1] for p in polyline]
    # note: higher lat → lower tile y
    x0, y0 = lat_lng_to_tile(max(lats), min(lngs), zoom)
    x1, y1 = lat_lng_to_tile(min(lats), max(lngs), zoom)
    tiles: set[tuple[int, int]] = set()
    for x in range(max(0, x0 - pad), x1 + pad + 1):
        for y in range(max(0, y0 - pad), y1 + pad + 1):
            tiles.add((x, y))
    return tiles


# ─── ERA5 grid ────────────────────────────────────────────────────────────────

def _snap(v: float) -> float:
    return round(round(v / GRID_RESOLUTION) * GRID_RESOLUTION, 4)


def grid_bbox(polyline: list) -> tuple[float, float, float, float]:
    lats = [p[0] for p in polyline]
    lngs = [p[1] for p in polyline]
    return (
        _snap(min(lats) - GRID_BUFFER),
        _snap(max(lats) + GRID_BUFFER),
        _snap(min(lngs) - GRID_BUFFER),
        _snap(max(lngs) + GRID_BUFFER),
    )


def grid_points(min_lat: float, max_lat: float, min_lng: float, max_lng: float) -> list[tuple[float, float]]:
    pts, lat = [], min_lat
    while lat <= max_lat + 0.001:
        lng = min_lng
        while lng <= max_lng + 0.001:
            pts.append((_snap(lat), _snap(lng)))
            lng += GRID_RESOLUTION
        lat += GRID_RESOLUTION
    return pts


def _fetch_point(lat: float, lng: float, ds: str, use_archive: bool) -> dict | None:
    base = "archive-api.open-meteo.com/v1/archive" if use_archive else "api.open-meteo.com/v1/forecast"
    url  = (f"https://{base}?latitude={lat:.4f}&longitude={lng:.4f}"
            f"&start_date={ds}&end_date={ds}&hourly={ERA5_FIELDS}&timezone=UTC")
    try:
        r = requests.get(url, timeout=15)
        if r.status_code == 200:
            return {"lat": lat, "lng": lng, "hourly": r.json().get("hourly", {})}
    except Exception as e:
        log.debug(f"ERA5 point {lat},{lng}: {e}")
    return None


def fetch_era5_grid(polyline: list, act_date: date) -> list[dict]:
    ds          = str(act_date)
    use_archive = act_date <= date.today() - timedelta(days=ARCHIVE_CUTOFF_DAYS)
    pts         = grid_points(*grid_bbox(polyline))
    if not pts:
        return []
    results = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(_fetch_point, lat, lng, ds, use_archive): (lat, lng) for lat, lng in pts}
        for fut in as_completed(futures):
            res = fut.result()
            if res:
                results.append(res)
            time.sleep(0.03)
    return results


def era5_to_rows(grid_data: list[dict], act_date: date) -> list[dict]:
    rows = []
    for pt in grid_data:
        h = pt["hourly"]
        times  = h.get("time", [])
        temps  = h.get("temperature_2m", [])
        precip = h.get("precipitation", [])
        winds  = h.get("wind_speed_10m", [])
        windds = h.get("wind_direction_10m", [])
        for i, t in enumerate(times):
            try:
                hour = datetime.fromisoformat(t).hour
                rows.append({
                    "lat":               pt["lat"],
                    "lng":               pt["lng"],
                    "date":              act_date,
                    "hour":              hour,
                    "temperature_2m":    temps[i]  if i < len(temps)  else None,
                    "precipitation":     precip[i] if i < len(precip) else None,
                    "wind_speed_10m":    winds[i]  if i < len(winds)  else None,
                    "wind_direction_10m": windds[i] if i < len(windds) else None,
                })
            except Exception:
                continue
    return rows


# ─── RainViewer radar ─────────────────────────────────────────────────────────

def fetch_rainviewer_frames() -> list[dict]:
    """Return list of {timestamp, host, path} for all available past radar frames."""
    try:
        r = requests.get(RAINVIEWER_API, timeout=10)
        if r.status_code != 200:
            return []
        data = r.json()
        host = data.get("host", "https://tilecache.rainviewer.com")
        return [{"timestamp": f["time"], "host": host, "path": f["path"]}
                for f in data.get("radar", {}).get("past", [])]
    except Exception as e:
        log.warning(f"RainViewer API: {e}")
        return []


def download_tile(host: str, path: str, z: int, x: int, y: int) -> bytes | None:
    url = f"{host}{path}/512/{z}/{x}/{y}/2/1_1.png"
    try:
        r = requests.get(url, timeout=15)
        if r.status_code == 200:
            return r.content
    except Exception as e:
        log.debug(f"Radar tile {z}/{x}/{y}: {e}")
    return None


def activity_time_range(start_time: datetime, duration_seconds: int | None) -> tuple[datetime, datetime]:
    end = start_time + timedelta(seconds=duration_seconds or 3600)
    return start_time, end


def frames_for_activity(frames: list[dict], start_time: datetime, duration_seconds: int | None) -> list[dict]:
    """Return radar frames that overlap the activity's time window."""
    act_start, act_end = activity_time_range(start_time, duration_seconds)
    # Add 30-min buffer each side
    window_start = act_start - timedelta(minutes=30)
    window_end   = act_end   + timedelta(minutes=30)
    matching = []
    for f in frames:
        ts = datetime.fromtimestamp(f["timestamp"], tz=timezone.utc)
        if window_start <= ts <= window_end:
            matching.append(f)
    return matching
