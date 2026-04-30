import { useEffect, useState, useMemo, useRef, Fragment } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { fetchTouringData } from '../api'
import type { TouringActivity, TouringData, WeatherHourly, CountryCrossing } from '../types'

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
  return ['↑','↗','→','↘','↓','↙','←','↖'][Math.round(deg / 45) % 8]
}

function getHourIndex(wd: WeatherHourly, targetMs: number): number {
  const target = new Date(targetMs)
  const hour = target.getHours()
  const dateStr = target.toISOString().slice(0, 10)
  const idx = wd.time?.findIndex(t => t.startsWith(dateStr) && parseInt(t.slice(11, 13)) === hour)
  return idx >= 0 ? idx : hour
}

// ─── Map ──────────────────────────────────────────────────────────────────────

function AutoFit({ pts }: { pts: [number, number][] }) {
  const map = useMap()
  const fitted = useRef(false)
  useEffect(() => {
    if (pts.length > 0 && !fitted.current) {
      map.fitBounds(pts, { padding: [40, 40], maxZoom: 13 })
      fitted.current = true
    }
  }, [pts.length])
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

const ACTIVITY_COLORS: Record<string, string> = {
  CYCLING: '#3b82f6', TRAIL_RUNNING: '#f97316', RUNNING: '#eab308',
  HIKING: '#22c55e', WALKING: '#14b8a6', MOUNTAIN_BIKING: '#a855f7',
}
function activityColor(type: string) { return ACTIVITY_COLORS[type] ?? '#94a3b8' }

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

// ─── Sub-components ───────────────────────────────────────────────────────────

function WeatherCard({ act }: { act: TouringActivity }) {
  const wd = act.weather_data
  const date = new Date(act.start_time)
  const label = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

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
      {act.country && (
        <div className="text-xs text-slate-500 mt-1">{flagOf(act.country)} {nameOf(act.country)}</div>
      )}
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

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props { start: string; end: string }

export default function TouringTab({ start, end }: Props) {
  const [data, setData] = useState<TouringData | null>(null)
  const [loading, setLoading] = useState(true)
  const [sliderValue, setSliderValue] = useState(0)

  useEffect(() => {
    setLoading(true)
    fetchTouringData(start, end)
      .then(d => { setData(d); setSliderValue(0) })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [start, end])

  const activities = data?.activities ?? []
  const sleep = data?.sleep ?? []

  const { tourStartMs, tourEndMs, totalMinutes } = useMemo(() => {
    if (!activities.length) return { tourStartMs: 0, tourEndMs: 0, totalMinutes: 0 }
    const starts = activities.map(a => +new Date(a.start_time))
    const ends = activities.map(a => +new Date(a.start_time) + (a.duration_seconds || 0) * 1000)
    const tourStartMs = Math.min(...starts)
    const tourEndMs = Math.max(...ends)
    return { tourStartMs, tourEndMs, totalMinutes: Math.ceil((tourEndMs - tourStartMs) / 60000) }
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

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-slate-600 border-t-blue-400 rounded-full animate-spin" />
    </div>
  )

  if (!activities.length) return (
    <div className="bg-slate-800 rounded-xl p-8 text-center text-slate-500">
      No activities with GPS routes in this period
    </div>
  )

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
            <TileLayer
              url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)'
              maxZoom={17}
            />
            {allPts.length > 0 && <AutoFit pts={allPts} />}

            {/* Routes */}
            {activities.map(a => (
              <Polyline
                key={a.activity_id}
                positions={a.polyline.map(p => [p[0], p[1]] as [number, number])}
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

            {/* Country crossings */}
            {activities.flatMap(a =>
              (a.country_crossings ?? []).map((c, i) => (
                <Marker
                  key={`${a.activity_id}-cross-${i}`}
                  position={[c.lat, c.lng]}
                  icon={makeFlagIcon(c.from, c.to)}
                >
                  <Popup>
                    <div style={{ fontSize: 13 }}>
                      <b>Border crossing</b><br />
                      {flagOf(c.from)} {nameOf(c.from)} → {flagOf(c.to)} {nameOf(c.to)}
                    </div>
                  </Popup>
                </Marker>
              ))
            )}

            {/* Sleep markers */}
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

            {/* Current position from time slider */}
            {currentPos && (
              <Marker position={currentPos} icon={makeCircleIcon('#f97316', 14)}>
                <Popup><div style={{ fontSize: 12 }}>{fmtDateTime(currentMs)}</div></Popup>
              </Marker>
            )}
          </MapContainer>
        </div>

        {/* Map legend */}
        <div className="flex flex-wrap items-center gap-4 px-4 py-2 bg-slate-800/80 text-xs text-slate-400">
          {Array.from(new Set(activities.map(a => a.activity_type))).map(t => (
            <div key={t} className="flex items-center gap-1.5">
              <div className="w-4 h-1.5 rounded" style={{ backgroundColor: activityColor(t) }} />
              <span>{t.split('_').map(w => w[0] + w.slice(1).toLowerCase()).join(' ')}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <span className="text-base">🏁</span><span>Border crossing</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-base">🌙</span><span>Sleep stop</span>
          </div>
          {totalMinutes > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 rounded-full bg-orange-500 border-2 border-white" />
              <span>Your position</span>
            </div>
          )}
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

      {/* Daily weather */}
      {activities.some(a => a.weather_data) && (
        <div className="bg-slate-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Weather by Day</h3>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {activities.map(a => <WeatherCard key={a.activity_id} act={a} />)}
          </div>
        </div>
      )}

      {/* Country summary */}
      <div className="bg-slate-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Countries</h3>
        <CountrySummary activities={activities} />
      </div>
    </div>
  )
}
