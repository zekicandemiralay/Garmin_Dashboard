import { useEffect, useState, Fragment } from 'react'
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, useMap } from 'react-leaflet'
import type { MapActivity } from '../types'
import { fetchMapActivities } from '../api'

const TYPE_COLORS: Record<string, string> = {
  RUNNING:             '#2dd4bf',
  TRAIL_RUNNING:       '#2dd4bf',
  CYCLING:             '#34d399',
  MOUNTAIN_BIKING:     '#34d399',
  VIRTUAL_RIDE:        '#34d399',
  HIKING:              '#f59e0b',
  WALKING:             '#60a5fa',
  SWIMMING:            '#818cf8',
  OPEN_WATER_SWIMMING: '#818cf8',
  STRENGTH_TRAINING:   '#f87171',
  YOGA:                '#c084fc',
}
const DEFAULT_COLOR = '#94a3b8'
const color = (type: string) => TYPE_COLORS[type] ?? DEFAULT_COLOR

function fmtDur(s: number | null) {
  if (!s) return '—'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function fmtDist(m: number | null) {
  if (!m) return '—'
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}
function fmtPace(s: number | null) {
  if (!s) return '—'
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')} /km`
}
function fmtSpeed(a: MapActivity) {
  if (!a.distance_meters || !a.duration_seconds) return null
  return `${((a.distance_meters / a.duration_seconds) * 3.6).toFixed(1)} km/h`
}

// Auto-fit the map to show all points
function AutoFit({ pts }: { pts: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (pts.length > 0) map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 })
  }, [pts.length])
  return null
}

interface Props { start: string; end: string }

export default function ActivityMap({ start: defaultStart, end: defaultEnd }: Props) {
  const [rangeStart, setRangeStart] = useState(defaultStart)
  const [rangeEnd,   setRangeEnd]   = useState(defaultEnd)
  const [fetched,    setFetched]    = useState<{ start: string; end: string }>({ start: defaultStart, end: defaultEnd })
  const [data,       setData]       = useState<MapActivity[]>([])
  const [loading,    setLoading]    = useState(true)

  // When the global range changes, sync local inputs too
  useEffect(() => {
    setRangeStart(defaultStart)
    setRangeEnd(defaultEnd)
    setFetched({ start: defaultStart, end: defaultEnd })
  }, [defaultStart, defaultEnd])

  useEffect(() => {
    setLoading(true)
    fetchMapActivities(fetched.start, fetched.end)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [fetched.start, fetched.end])

  function apply() {
    if (rangeStart && rangeEnd && rangeStart <= rangeEnd)
      setFetched({ start: rangeStart, end: rangeEnd })
  }

  const located = data.filter(a => a.start_lat != null && a.start_lng != null)

  // Collect all points for auto-fit
  const allPts: [number, number][] = located.flatMap(a => {
    const pts: [number, number][] = [[a.start_lat!, a.start_lng!]]
    if (a.end_lat && a.end_lng) pts.push([a.end_lat, a.end_lng])
    if (a.polyline?.length) (a.polyline as [number, number][]).forEach(p => pts.push(p))
    return pts
  })

  const presentTypes = [...new Set(located.map(a => a.activity_type))]
  const hasAnyEnd    = located.some(a => a.end_lat && a.end_lng)
  const hasAnyRoute  = located.some(a => (a.polyline?.length ?? 0) > 2)
  const isCustom     = fetched.start !== defaultStart || fetched.end !== defaultEnd

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      {/* Header + date range picker */}
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-300">Activity Map</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {loading
              ? 'Loading…'
              : `${located.length} activities · dots = start${hasAnyEnd ? ' · rings = end' : ''}${hasAnyRoute ? ' · lines = route' : ''}`
            }
          </p>
        </div>

        {/* Date pickers */}
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-slate-400">From</label>
            <input
              type="date"
              value={rangeStart}
              onChange={e => setRangeStart(e.target.value)}
              className="bg-slate-700 text-slate-200 text-xs rounded-md px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-slate-400">To</label>
            <input
              type="date"
              value={rangeEnd}
              onChange={e => setRangeEnd(e.target.value)}
              className="bg-slate-700 text-slate-200 text-xs rounded-md px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={apply}
            disabled={!rangeStart || !rangeEnd || rangeStart > rangeEnd}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          >
            Show
          </button>
          {isCustom && (
            <button
              onClick={() => {
                setRangeStart(defaultStart)
                setRangeEnd(defaultEnd)
                setFetched({ start: defaultStart, end: defaultEnd })
              }}
              className="px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Map */}
      {!loading && located.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-slate-500 text-sm rounded-lg bg-slate-700/40">
          No GPS data for this period — sync populates this automatically for outdoor activities
        </div>
      ) : (
        <div className="rounded-lg overflow-hidden" style={{ height: 500 }}>
          <MapContainer center={[0, 0]} zoom={2} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            />
            {allPts.length > 0 && <AutoFit pts={allPts} />}

            {located.map(a => {
              const clr      = color(a.activity_type)
              const hasRoute = (a.polyline?.length ?? 0) > 2

              const popup = (
                <Popup>
                  <div style={{ fontSize: 13, minWidth: 180 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{a.name}</div>
                    <div style={{ color: '#888', fontSize: 11, marginBottom: 6 }}>
                      {new Date(a.start_time).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                      {' · '}{a.activity_type.replace(/_/g, ' ')}
                    </div>
                    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                      <tbody>
                        {a.distance_meters != null && (
                          <tr><td style={{ color: '#aaa', paddingRight: 8 }}>Distance</td><td>{fmtDist(a.distance_meters)}</td></tr>
                        )}
                        <tr><td style={{ color: '#aaa', paddingRight: 8 }}>Duration</td><td>{fmtDur(a.duration_seconds)}</td></tr>
                        {a.avg_pace_sec_per_km != null && (
                          <tr><td style={{ color: '#aaa', paddingRight: 8 }}>Pace</td><td>{fmtPace(a.avg_pace_sec_per_km)}</td></tr>
                        )}
                        {fmtSpeed(a) && (
                          <tr><td style={{ color: '#aaa', paddingRight: 8 }}>Speed</td><td>{fmtSpeed(a)}</td></tr>
                        )}
                        {a.avg_hr != null && (
                          <tr><td style={{ color: '#aaa', paddingRight: 8 }}>Avg HR</td><td>{a.avg_hr} bpm</td></tr>
                        )}
                        {a.elevation_gain_m != null && (
                          <tr><td style={{ color: '#aaa', paddingRight: 8 }}>Elevation</td><td>+{Math.round(a.elevation_gain_m)} m</td></tr>
                        )}
                        {a.calories != null && (
                          <tr><td style={{ color: '#aaa', paddingRight: 8 }}>Calories</td><td>{a.calories} kcal</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Popup>
              )

              return (
                <Fragment key={a.activity_id}>
                  {/* Full GPS route */}
                  {hasRoute && (
                    <Polyline
                      positions={a.polyline as [number, number][]}
                      pathOptions={{ color: clr, weight: 3, opacity: 0.85 }}
                    >
                      {popup}
                    </Polyline>
                  )}

                  {/* Start marker — filled circle */}
                  <CircleMarker
                    center={[a.start_lat!, a.start_lng!]}
                    radius={hasRoute ? 5 : 6}
                    pathOptions={{ color: clr, fillColor: clr, fillOpacity: 0.9, weight: 1.5 }}
                  >
                    {!hasRoute && popup}
                  </CircleMarker>

                  {/* End marker — hollow ring (same color, no fill) */}
                  {a.end_lat != null && a.end_lng != null && (
                    <CircleMarker
                      center={[a.end_lat, a.end_lng]}
                      radius={hasRoute ? 5 : 6}
                      pathOptions={{ color: clr, fillColor: '#1e293b', fillOpacity: 0.9, weight: 2.5 }}
                    />
                  )}
                </Fragment>
              )
            })}
          </MapContainer>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mt-3">
        {presentTypes.map(type => (
          <div key={type} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color(type) }} />
            <span className="text-xs text-slate-400">{type.replace(/_/g, ' ')}</span>
          </div>
        ))}
        {located.length > 0 && (
          <div className="flex items-center gap-3 ml-auto text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-400" /> start
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-slate-400" /> end
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
