import { useEffect, useState, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import {
  fetchTouringData, fetchActivities, fetchTours,
  createTour as apiCreateTour, fetchTourDetail,
  updateTour as apiUpdateTour, deleteTour as apiDeleteTour,
} from '../api'
import type { TouringActivity, TouringData, WeatherHourly, TourSummary, TourDetail } from '../types'
import type { Activity } from '../types'
import TrainingLoadChart from './TrainingLoadChart'
import ActivityPaceChart from './ActivityPaceChart'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const nameOf = (() => {
  const fmt = new Intl.DisplayNames(['en'], { type: 'region' })
  return (c: string) => { try { return fmt.of(c) ?? c } catch { return c } }
})()

function flagOf(code: string): string {
  return code.toUpperCase().split('').map(c => String.fromCodePoint(c.charCodeAt(0) + 0x1F1A5)).join('')
}

function fmtKm(m: number | null) {
  if (!m) return '—'
  return m >= 1000 ? `${(m / 1000).toFixed(0)} km` : `${Math.round(m)} m`
}

function fmtKmNum(km: number) {
  return km >= 1 ? `${km.toFixed(0)} km` : `${(km * 1000).toFixed(0)} m`
}

function fmtDur(s: number | null) {
  if (!s) return '—'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function fmtDateTime(ms: number) {
  const d = new Date(ms)
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    + '  ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function fmtType(t: string) {
  return t.split('_').map(w => w[0] + w.slice(1).toLowerCase()).join(' ')
}

function fmtTourDates(start: string | null, end: string | null): string {
  if (!start) return ''
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const s = new Date(start + 'T12:00:00')
  if (!end || end === start) return s.toLocaleDateString(undefined, { ...opts, year: 'numeric' })
  const e = new Date(end + 'T12:00:00')
  if (s.getFullYear() === e.getFullYear()) {
    return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, { ...opts, year: 'numeric' })}`
  }
  return `${s.toLocaleDateString(undefined, { ...opts, year: 'numeric' })} – ${e.toLocaleDateString(undefined, { ...opts, year: 'numeric' })}`
}

function weatherEmoji(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 3) return '⛅'
  if (code <= 48) return '🌫️'
  if (code <= 67) return '🌧️'
  if (code <= 77) return '❄️'
  if (code <= 82) return '🌦️'
  return '⛈️'
}

function windArrow(deg: number): string {
  return ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'][Math.round(deg / 45) % 8]
}

function getHourIndex(wd: WeatherHourly, targetMs: number): number {
  const target = new Date(targetMs)
  const hour = target.getHours()
  const dateStr = target.toISOString().slice(0, 10)
  const idx = wd.time?.findIndex(t => t.startsWith(dateStr) && parseInt(t.slice(11, 13)) === hour)
  return idx >= 0 ? idx : hour
}

const ACTIVITY_COLORS: Record<string, string> = {
  CYCLING: '#3b82f6', TRAIL_RUNNING: '#f97316', RUNNING: '#eab308',
  HIKING: '#22c55e', WALKING: '#14b8a6', MOUNTAIN_BIKING: '#a855f7',
}
function activityColor(type: string) { return ACTIVITY_COLORS[type] ?? '#94a3b8' }

const TYPE_EMOJI: Record<string, string> = {
  CYCLING: '🚴', TRAIL_RUNNING: '🏃', RUNNING: '🏃', HIKING: '🥾',
  WALKING: '🚶', MOUNTAIN_BIKING: '🚵',
}
function typeEmoji(type: string) { return TYPE_EMOJI[type] ?? '🏅' }

// ─── Map helpers ──────────────────────────────────────────────────────────────

function AutoFit({ pts, fitKey }: { pts: [number, number][]; fitKey: string }) {
  const map = useMap()
  useEffect(() => {
    if (pts.length > 0) map.fitBounds(pts, { padding: [40, 40], maxZoom: 13 })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey])
  return null
}

function makeCircleIcon(color: string, size = 12) {
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>`,
    className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
  })
}

function makeFlagIcon(from: string, to: string) {
  const html = `<div style="background:rgba(15,23,42,.85);border:1px solid #475569;border-radius:6px;padding:2px 5px;font-size:13px;line-height:1.4;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.4)">${flagOf(from)}→${flagOf(to)}</div>`
  return L.divIcon({ html, className: '', iconSize: [60, 26], iconAnchor: [30, 13] })
}

function makeSleepIcon(score: number | null) {
  const color = score == null ? '#94a3b8' : score >= 80 ? '#34d399' : score >= 60 ? '#fbbf24' : '#f87171'
  const html = `<div style="background:rgba(15,23,42,.9);border:1.5px solid ${color};border-radius:8px;padding:2px 6px;font-size:11px;color:${color};white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.4)">🌙${score ? ` ${score}` : ''}</div>`
  return L.divIcon({ html, className: '', iconSize: [48, 22], iconAnchor: [24, 11] })
}

// ─── Position interpolation ───────────────────────────────────────────────────

function positionAtTime(activities: TouringActivity[], targetMs: number): [number, number] | null {
  const sorted = [...activities].sort((a, b) => +new Date(a.start_time) - +new Date(b.start_time))
  for (const act of sorted) {
    const s = +new Date(act.start_time)
    const e = s + (act.duration_seconds || 0) * 1000
    if (targetMs >= s && targetMs <= e && act.polyline?.length) {
      const f = (targetMs - s) / (e - s)
      const idx = Math.min(Math.floor(f * act.polyline.length), act.polyline.length - 1)
      return [act.polyline[idx][0], act.polyline[idx][1]]
    }
  }
  const past = sorted.filter(a => +new Date(a.start_time) + (a.duration_seconds || 0) * 1000 < targetMs)
  if (past.length) {
    const poly = past[past.length - 1].polyline
    if (poly?.length) return [poly[poly.length - 1][0], poly[poly.length - 1][1]]
  }
  const first = sorted[0]?.polyline?.[0]
  return first ? [first[0], first[1]] : null
}

// ─── Weather sub-components ───────────────────────────────────────────────────

function WeatherCard({ act }: { act: TouringActivity }) {
  const wd = act.weather_data
  const label = new Date(act.start_time).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

  if (!wd?.temperature_2m?.length) {
    return (
      <div className="bg-slate-700/60 rounded-lg p-3 min-w-[110px] shrink-0">
        <div className="text-xs text-slate-400 mb-1">{label}</div>
        <div className="text-xs text-slate-500">No weather data</div>
      </div>
    )
  }

  const temps = wd.temperature_2m.filter(Boolean)
  const maxT = Math.round(Math.max(...temps))
  const minT = Math.round(Math.min(...temps))
  const totalPrecip = wd.precipitation?.reduce((s, v) => s + (v || 0), 0) ?? 0
  const maxWind = Math.round(Math.max(...(wd.wind_speed_10m?.filter(Boolean) ?? [0])))
  const codes = wd.weather_code?.filter(Boolean) ?? []
  const dominantCode = codes.sort((a, b) =>
    codes.filter(c => c === b).length - codes.filter(c => c === a).length
  )[0] ?? 0

  return (
    <div className="bg-slate-700/60 rounded-lg p-3 min-w-[120px] shrink-0">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className="text-2xl mb-1">{weatherEmoji(dominantCode)}</div>
      <div className="text-sm font-semibold text-slate-100">{maxT}° / {minT}°</div>
      {totalPrecip > 0.1 && <div className="text-xs text-blue-300 mt-0.5">💧 {totalPrecip.toFixed(1)} mm</div>}
      <div className="text-xs text-slate-400 mt-0.5">💨 {maxWind} km/h</div>
      {act.country && <div className="text-xs text-slate-500 mt-1">{flagOf(act.country)} {nameOf(act.country)}</div>}
    </div>
  )
}

function CurrentWeatherPanel({ act, timeMs }: { act: TouringActivity; timeMs: number }) {
  const wd = act.weather_data
  if (!wd?.temperature_2m?.length) return null
  const idx = getHourIndex(wd, timeMs)
  const temp = wd.temperature_2m?.[idx]
  const precip = wd.precipitation?.[idx]
  const wind = wd.wind_speed_10m?.[idx]
  const windDir = wd.wind_direction_10m?.[idx]
  const code = wd.weather_code?.[idx] ?? 0
  const humidity = wd.relative_humidity_2m?.[idx]
  return (
    <div className="flex items-center gap-4 bg-slate-700/60 rounded-lg px-4 py-2 text-sm">
      <span className="text-xl">{weatherEmoji(code)}</span>
      {temp != null && <span className="text-slate-100 font-medium">{Math.round(temp)}°C</span>}
      {wind != null && <span className="text-slate-300">{windArrow(windDir ?? 0)} {Math.round(wind)} km/h</span>}
      {precip != null && precip > 0 && <span className="text-blue-300">💧 {precip.toFixed(1)} mm/h</span>}
      {humidity != null && <span className="text-slate-400">{Math.round(humidity)}% RH</span>}
    </div>
  )
}

function CountrySummary({ activities }: { activities: TouringActivity[] }) {
  const byCountry: Record<string, number> = {}
  for (const a of activities) {
    const c = a.country ?? '??'
    byCountry[c] = (byCountry[c] ?? 0) + (a.distance_meters ?? 0)
  }
  const sorted = Object.entries(byCountry).sort((a, b) => b[1] - a[1])
  if (!sorted.length) return null
  return (
    <div className="flex flex-wrap gap-3">
      {sorted.map(([code, meters]) => (
        <div key={code} className="flex items-center gap-1.5 bg-slate-700/60 rounded-lg px-3 py-1.5">
          <span className="text-base">{flagOf(code)}</span>
          <div>
            <div className="text-xs font-medium text-slate-200">{nameOf(code)}</div>
            <div className="text-xs text-slate-400">{fmtKm(meters)}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-slate-600 border-t-blue-400 rounded-full animate-spin" />
    </div>
  )
}

// ─── TourMapView ──────────────────────────────────────────────────────────────

type SleepEntry = TouringData['sleep'][number]

function TourMapView({ activities, sleep }: { activities: TouringActivity[]; sleep: SleepEntry[] }) {
  const [sliderValue, setSliderValue] = useState(0)
  const [topo, setTopo] = useState(false)

  const fitKey = useMemo(() => activities.map(a => a.activity_id).join(','), [activities])

  const { tourStartMs, tourEndMs, totalMinutes } = useMemo(() => {
    if (!activities.length) return { tourStartMs: 0, tourEndMs: 0, totalMinutes: 0 }
    const starts = activities.map(a => +new Date(a.start_time))
    const ends = activities.map(a => +new Date(a.start_time) + (a.duration_seconds || 0) * 1000)
    return {
      tourStartMs: Math.min(...starts),
      tourEndMs: Math.max(...ends),
      totalMinutes: Math.ceil((Math.max(...ends) - Math.min(...starts)) / 60000),
    }
  }, [activities])

  const currentMs = tourStartMs + sliderValue * 60000
  const currentPos = useMemo(
    () => totalMinutes > 0 ? positionAtTime(activities, currentMs) : null,
    [activities, currentMs, totalMinutes]
  )
  const currentAct = useMemo(
    () => activities.find(a => {
      const s = +new Date(a.start_time), e = s + (a.duration_seconds || 0) * 1000
      return currentMs >= s && currentMs <= e
    }),
    [activities, currentMs]
  )
  const allPts = useMemo<[number, number][]>(
    () => activities.flatMap(a => a.polyline?.map(p => [p[0], p[1]] as [number, number]) ?? []),
    [activities]
  )
  const sleepMarkers = useMemo(() => {
    return sleep.map(s => {
      const sleepDate = new Date(s.date).toDateString()
      const prevDate = new Date(+new Date(s.date) - 86400000).toDateString()
      const dayActs = activities
        .filter(a => {
          const d = new Date(a.start_time).toDateString()
          return d === sleepDate || d === prevDate
        })
        .sort((a, b) => +new Date(b.start_time) - +new Date(a.start_time))
      const last = dayActs[0]
      if (!last?.polyline?.length) return null
      const pt = last.polyline[last.polyline.length - 1]
      return { lat: pt[0], lng: pt[1], date: s.date, score: s.sleep_score, hours: s.duration_seconds }
    }).filter(Boolean) as { lat: number; lng: number; date: string; score: number | null; hours: number | null }[]
  }, [activities, sleep])

  const totalStats = useMemo(() => ({
    distance: activities.reduce((s, a) => s + (a.distance_meters ?? 0), 0),
    elevation: activities.reduce((s, a) => s + (a.elevation_gain_m ?? 0), 0),
    duration: activities.reduce((s, a) => s + (a.duration_seconds ?? 0), 0),
    days: new Set(activities.map(a => a.start_time.slice(0, 10))).size,
  }), [activities])

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total distance', value: fmtKm(totalStats.distance) },
          { label: 'Elevation gain', value: totalStats.elevation > 0 ? `+${Math.round(totalStats.elevation).toLocaleString()} m` : '—' },
          { label: 'Moving time', value: fmtDur(totalStats.duration) },
          { label: 'Active days', value: `${totalStats.days}` },
        ].map(s => (
          <div key={s.label} className="bg-slate-800 rounded-xl px-4 py-3">
            <div className="text-xs text-slate-500 mb-0.5">{s.label}</div>
            <div className="text-xl font-semibold text-slate-100">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Map */}
      <div className="bg-slate-800 rounded-xl overflow-hidden">
        <div style={{ height: 520 }}>
          <MapContainer center={[47, 13]} zoom={6} style={{ height: '100%', width: '100%' }}>
            {topo ? (
              <TileLayer
                url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)'
                maxZoom={17}
              />
            ) : (
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
              />
            )}
            {allPts.length > 0 && <AutoFit pts={allPts} fitKey={fitKey} />}
            {activities.map(a => (
              <Polyline
                key={a.activity_id}
                positions={a.polyline?.map(p => [p[0], p[1]] as [number, number]) ?? []}
                pathOptions={{ color: activityColor(a.activity_type), weight: 3, opacity: 0.85 }}
              >
                <Popup>
                  <div style={{ fontSize: 13, minWidth: 160 }}>
                    <div style={{ fontWeight: 600 }}>{a.name}</div>
                    <div style={{ color: '#888', fontSize: 11 }}>{new Date(a.start_time).toLocaleDateString()}</div>
                    <div style={{ marginTop: 4 }}>{fmtKm(a.distance_meters)} · {fmtDur(a.duration_seconds)}</div>
                    {a.elevation_gain_m != null && <div style={{ color: '#aaa', fontSize: 11 }}>+{Math.round(a.elevation_gain_m)} m elevation</div>}
                  </div>
                </Popup>
              </Polyline>
            ))}
            {activities.flatMap(a =>
              (a.country_crossings ?? []).map((c, i) => (
                <Marker key={`${a.activity_id}-cross-${i}`} position={[c.lat, c.lng]} icon={makeFlagIcon(c.from, c.to)}>
                  <Popup>
                    <div style={{ fontSize: 13 }}>
                      <b>Border crossing</b><br />
                      {flagOf(c.from)} {nameOf(c.from)} → {flagOf(c.to)} {nameOf(c.to)}
                    </div>
                  </Popup>
                </Marker>
              ))
            )}
            {sleepMarkers.map(s => (
              <Marker key={s.date} position={[s.lat, s.lng]} icon={makeSleepIcon(s.score)}>
                <Popup>
                  <div style={{ fontSize: 13 }}>
                    <b>Sleep {s.date}</b><br />
                    {s.hours ? `${(s.hours / 3600).toFixed(1)}h` : ''}{s.score ? ` · score ${s.score}` : ''}
                  </div>
                </Popup>
              </Marker>
            ))}
            {currentPos && (
              <Marker position={currentPos} icon={makeCircleIcon('#f97316', 14)}>
                <Popup><div style={{ fontSize: 12 }}>{fmtDateTime(currentMs)}</div></Popup>
              </Marker>
            )}
          </MapContainer>
        </div>
        <div className="flex flex-wrap items-center gap-4 px-4 py-2 bg-slate-800/80 text-xs text-slate-400">
          {Array.from(new Set(activities.map(a => a.activity_type))).map(t => (
            <div key={t} className="flex items-center gap-1.5">
              <div className="w-4 h-1.5 rounded" style={{ backgroundColor: activityColor(t) }} />
              <span>{fmtType(t)}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5"><span>🏁</span><span>Border crossing</span></div>
          <div className="flex items-center gap-1.5"><span>🌙</span><span>Sleep stop</span></div>
          {totalMinutes > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 rounded-full bg-orange-500 border-2 border-white" />
              <span>Your position</span>
            </div>
          )}
          <button
            onClick={() => setTopo(t => !t)}
            className={`ml-auto px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
              topo
                ? 'bg-green-600/20 border-green-600/50 text-green-300 hover:bg-green-600/30'
                : 'bg-slate-700 border-slate-600 text-slate-300 hover:text-white'
            }`}
          >
            {topo ? '🌑 Dark' : '🗺 Terrain'}
          </button>
        </div>
      </div>

      {/* Time slider */}
      {totalMinutes > 0 && (
        <div className="bg-slate-800 rounded-xl px-4 py-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{fmtDateTime(tourStartMs)}</span>
            <span className="text-slate-200 font-medium">{fmtDateTime(currentMs)}</span>
            <span>{fmtDateTime(tourEndMs)}</span>
          </div>
          <input
            type="range" min={0} max={totalMinutes} value={sliderValue}
            onChange={e => setSliderValue(Number(e.target.value))}
            className="w-full accent-orange-500"
          />
          <div className="flex items-center gap-3 flex-wrap">
            {currentAct && (
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3 h-1.5 rounded" style={{ backgroundColor: activityColor(currentAct.activity_type) }} />
                <span className="text-slate-300">{currentAct.name}</span>
                {currentAct.country && <span className="text-slate-500">{flagOf(currentAct.country)} {nameOf(currentAct.country)}</span>}
              </div>
            )}
            {currentAct?.weather_data && (
              <CurrentWeatherPanel act={currentAct} timeMs={currentMs} />
            )}
          </div>
        </div>
      )}

      {/* Weather by day */}
      <div className="bg-slate-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Weather by Day</h3>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {activities.map(a => <WeatherCard key={a.activity_id} act={a} />)}
        </div>
        {!activities.some(a => a.weather_data) && (
          <p className="text-xs text-slate-500 mt-2">Weather is fetched automatically for activities older than 2 days — check back after the next sync cycle.</p>
        )}
      </div>

      {/* Country summary */}
      <div className="bg-slate-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Countries</h3>
        <CountrySummary activities={activities} />
      </div>
    </div>
  )
}

// ─── BrowseView ───────────────────────────────────────────────────────────────

function BrowseView({ start, end }: { start: string; end: string }) {
  const [data, setData] = useState<TouringData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchTouringData(start, end)
      .then(d => { setData(d); setError(null) })
      .catch(e => { setData(null); setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => setLoading(false))
  }, [start, end])

  if (loading) return <Spinner />
  if (error) return (
    <div className="bg-slate-800 rounded-xl p-8 text-center text-red-400 text-sm">
      Failed to load activities: {error}
    </div>
  )
  if (!data?.activities?.length) return (
    <div className="bg-slate-800 rounded-xl p-8 text-center text-slate-500">
      No activities with GPS routes in this period
    </div>
  )

  return (
    <div className="space-y-4">
      <TourMapView activities={data.activities} sleep={data.sleep} />
      <TrainingLoadChart data={data.activities as unknown as Activity[]} />
      <ActivityPaceChart data={data.activities as unknown as Activity[]} />
    </div>
  )
}

// ─── TourDetailView ───────────────────────────────────────────────────────────

interface TourDetailViewProps {
  tourId: number
  onBack: () => void
  onDelete: () => void
  onUpdated: (name: string, description: string | null) => void
}

function TourDetailView({ tourId, onBack, onDelete, onUpdated }: TourDetailViewProps) {
  const [detail, setDetail] = useState<TourDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetchTourDetail(tourId)
      .then(d => { setDetail(d); setEditName(d.tour.name); setEditDesc(d.tour.description ?? '') })
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }, [tourId])

  async function handleSave() {
    if (!detail || !editName.trim()) return
    setSaving(true)
    try {
      await apiUpdateTour(tourId, { name: editName.trim(), description: editDesc.trim() || null })
      setDetail(d => d ? { ...d, tour: { ...d.tour, name: editName.trim(), description: editDesc.trim() || null } } : d)
      onUpdated(editName.trim(), editDesc.trim() || null)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    await apiDeleteTour(tourId)
    onDelete()
  }

  if (loading) return <Spinner />
  if (!detail) return (
    <div className="bg-slate-800 rounded-xl p-8 text-center text-slate-500">Tour not found</div>
  )

  const { tour, activities, sleep } = detail
  const dateRange = activities.length
    ? fmtTourDates(activities[0].start_time.slice(0, 10), activities[activities.length - 1].start_time.slice(0, 10))
    : ''

  return (
    <div className="space-y-4">
      {/* Tour header */}
      <div className="bg-slate-800 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <button onClick={onBack} className="text-slate-400 hover:text-white mt-0.5 shrink-0 text-xl leading-none">←</button>
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="space-y-2">
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="Tour name"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                />
                <input
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  placeholder="Description (optional)"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-blue-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    disabled={saving || !editName.trim()}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-xs font-medium text-white"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => { setEditing(false); setEditName(tour.name); setEditDesc(tour.description ?? '') }}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-medium text-slate-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-base font-semibold text-white">{tour.name}</h2>
                {tour.description && <p className="text-sm text-slate-400 mt-0.5">{tour.description}</p>}
                {dateRange && <p className="text-xs text-slate-500 mt-0.5">{dateRange} · {activities.length} activities</p>}
              </>
            )}
          </div>
          {!editing && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setEditing(true)}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-medium text-slate-300"
              >
                Rename
              </button>
              {confirmDelete ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-red-400">Delete?</span>
                  <button onClick={handleDelete} className="px-2 py-1 bg-red-600 hover:bg-red-500 rounded text-xs font-medium text-white">Yes</button>
                  <button onClick={() => setConfirmDelete(false)} className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs font-medium text-slate-300">No</button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-red-900/60 rounded-lg text-xs font-medium text-slate-400 hover:text-red-300 transition-colors"
                >
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {activities.length > 0 ? (
        <>
          <TourMapView activities={activities} sleep={sleep} />
          <TrainingLoadChart data={activities as unknown as Activity[]} />
          <ActivityPaceChart data={activities as unknown as Activity[]} />

          {/* Activity list */}
          <div className="bg-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700">
              <h3 className="text-sm font-semibold text-slate-300">Activities</h3>
            </div>
            <div className="divide-y divide-slate-700/50">
              {activities.map(a => (
                <div key={a.activity_id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-700/30 transition-colors">
                  <span className="text-base shrink-0">{typeEmoji(a.activity_type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-200 truncate">{a.name}</div>
                    <div className="text-xs text-slate-500">
                      {new Date(a.start_time).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                      {a.country ? ` · ${flagOf(a.country)} ${nameOf(a.country)}` : ''}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm text-slate-300">{fmtKm(a.distance_meters)}</div>
                    <div className="text-xs text-slate-500">
                      {fmtDur(a.duration_seconds)}{a.elevation_gain_m ? ` · +${Math.round(a.elevation_gain_m)}m` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="bg-slate-800 rounded-xl p-8 text-center text-slate-500">No activities in this tour</div>
      )}
    </div>
  )
}

// ─── TourCreator ──────────────────────────────────────────────────────────────

interface TourCreatorProps {
  start: string
  end: string
  onCreated: (tourId: number) => void
  onCancel: () => void
}

function TourCreator({ start, end, onCreated, onCancel }: TourCreatorProps) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLoading(true)
    fetchActivities(start, end)
      .then(acts => setActivities([...acts].sort((a, b) => a.start_time.localeCompare(b.start_time))))
      .catch(() => setActivities([]))
      .finally(() => setLoading(false))
  }, [start, end])

  useEffect(() => { nameRef.current?.focus() }, [])

  const allSelected = activities.length > 0 && selected.size === activities.length

  function toggle(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleCreate() {
    if (!name.trim() || selected.size === 0) return
    setSaving(true)
    try {
      const { id } = await apiCreateTour(name.trim(), description.trim() || null, Array.from(selected))
      onCreated(id)
    } finally {
      setSaving(false)
    }
  }

  const byDate = useMemo(() => {
    const groups: Record<string, Activity[]> = {}
    for (const a of activities) {
      const d = a.start_time.slice(0, 10)
      if (!groups[d]) groups[d] = []
      groups[d].push(a)
    }
    return groups
  }, [activities])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="text-slate-400 hover:text-white text-xl leading-none">←</button>
        <h2 className="text-base font-semibold text-white">New Tour</h2>
      </div>

      <div className="bg-slate-800 rounded-xl p-4 space-y-3">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Tour name *</label>
          <input
            ref={nameRef}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Munich → Vienna 2025"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 placeholder-slate-500"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Description (optional)</label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Notes about the tour…"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-blue-500 placeholder-slate-500"
          />
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-300">Select Activities</h3>
            <p className="text-xs text-slate-500 mt-0.5">{start} – {end} · {selected.size} of {activities.length} selected</p>
          </div>
          {!loading && activities.length > 0 && (
            <button
              onClick={() => setSelected(allSelected ? new Set() : new Set(activities.map(a => a.activity_id)))}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
          )}
        </div>

        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="w-6 h-6 border-2 border-slate-600 border-t-blue-400 rounded-full animate-spin" />
          </div>
        ) : activities.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No activities in this period</div>
        ) : (
          <div className="divide-y divide-slate-700/40 max-h-[520px] overflow-y-auto">
            {Object.entries(byDate).map(([date, acts]) => (
              <div key={date}>
                <div className="px-4 py-1.5 bg-slate-900/50 text-xs text-slate-500 font-medium sticky top-0">
                  {new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
                {acts.map(a => (
                  <label key={a.activity_id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-700/30 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(a.activity_id)}
                      onChange={() => toggle(a.activity_id)}
                      className="rounded accent-blue-500 shrink-0 w-4 h-4"
                    />
                    <span className="text-base shrink-0">{typeEmoji(a.activity_type)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-200 truncate">{a.name}</div>
                      <div className="text-xs text-slate-500">{fmtType(a.activity_type)}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm text-slate-300">{fmtKm(a.distance_meters)}</div>
                      <div className="text-xs text-slate-500">{fmtDur(a.duration_seconds)}</div>
                    </div>
                  </label>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium text-slate-300"
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={saving || !name.trim() || selected.size === 0}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white"
        >
          {saving ? 'Creating…' : `Create Tour (${selected.size} activities)`}
        </button>
      </div>
    </div>
  )
}

// ─── TourListView ─────────────────────────────────────────────────────────────

interface TourListViewProps {
  tours: TourSummary[]
  loading: boolean
  onSelect: (id: number) => void
  onNew: () => void
  onBrowse: () => void
}

function TourListView({ tours, loading, onSelect, onNew, onBrowse }: TourListViewProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-200">Saved Tours</h2>
        <button onClick={onBrowse} className="text-sm text-blue-400 hover:text-blue-300">
          Browse current range →
        </button>
      </div>

      <button
        onClick={onNew}
        className="w-full border-2 border-dashed border-slate-700 hover:border-blue-500/60 rounded-xl py-4 text-sm text-slate-500 hover:text-blue-400 transition-colors flex items-center justify-center gap-2"
      >
        <span className="text-lg leading-none">+</span>
        <span>New Tour</span>
      </button>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-slate-600 border-t-blue-400 rounded-full animate-spin" />
        </div>
      ) : tours.length === 0 ? (
        <div className="bg-slate-800 rounded-xl p-10 text-center">
          <div className="text-4xl mb-3">🗺️</div>
          <p className="text-sm text-slate-400 font-medium">No saved tours yet</p>
          <p className="text-xs text-slate-500 mt-1">Pick a date range, click New Tour, and select your activities</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tours.map(t => (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className="bg-slate-800 hover:bg-slate-700 rounded-xl p-4 text-left transition-colors group"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-sm font-semibold text-slate-100 group-hover:text-blue-300 transition-colors leading-snug">
                  {t.name}
                </h3>
                <span className="text-xs text-slate-500 shrink-0">{t.activity_count} acts</span>
              </div>
              {t.description && (
                <p className="text-xs text-slate-400 mb-2 line-clamp-2">{t.description}</p>
              )}
              <div className="flex items-end justify-between mt-2">
                <span className="text-xl font-semibold text-slate-100">{fmtKmNum(t.total_km)}</span>
                <div className="text-right">
                  {t.start_date && (
                    <div className="text-xs text-slate-500">{fmtTourDates(t.start_date, t.end_date)}</div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

type View = 'list' | 'browse' | 'create' | 'detail'

interface Props { start: string; end: string }

export default function TouringTab({ start, end }: Props) {
  const [view, setView] = useState<View>('list')
  const [selectedTourId, setSelectedTourId] = useState<number | null>(null)
  const [tours, setTours] = useState<TourSummary[]>([])
  const [toursLoading, setToursLoading] = useState(true)

  function loadTours() {
    setToursLoading(true)
    fetchTours()
      .then(setTours)
      .catch(() => setTours([]))
      .finally(() => setToursLoading(false))
  }

  useEffect(() => { loadTours() }, [])

  function openTour(id: number) { setSelectedTourId(id); setView('detail') }

  function handleCreated(id: number) { loadTours(); openTour(id) }

  function handleDeleted() { loadTours(); setView('list') }

  function handleUpdated(name: string, description: string | null) {
    setTours(ts => ts.map(t => t.id === selectedTourId ? { ...t, name, description } : t))
  }

  return (
    <div>
      {view === 'list' && (
        <TourListView
          tours={tours}
          loading={toursLoading}
          onSelect={openTour}
          onNew={() => setView('create')}
          onBrowse={() => setView('browse')}
        />
      )}
      {view === 'browse' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setView('list')} className="text-slate-400 hover:text-white text-xl leading-none">←</button>
            <h2 className="text-sm font-medium text-slate-400">Browse: {start} – {end}</h2>
          </div>
          <BrowseView start={start} end={end} />
        </div>
      )}
      {view === 'create' && (
        <TourCreator
          start={start}
          end={end}
          onCreated={handleCreated}
          onCancel={() => setView('list')}
        />
      )}
      {view === 'detail' && selectedTourId != null && (
        <TourDetailView
          tourId={selectedTourId}
          onBack={() => setView('list')}
          onDelete={handleDeleted}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  )
}
