import { useEffect, useState, Fragment } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import type { MapActivity } from '../types'
import { fetchMapActivities } from '../api'

// SVG pin icons for start (green) and end (red)
function makePin(fill: string, border: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="30" viewBox="0 0 22 30">
    <path d="M11 0C6.03 0 2 4.03 2 9c0 6.75 9 21 9 21s9-14.25 9-21C20 4.03 15.97 0 11 0z"
      fill="${fill}" stroke="${border}" stroke-width="1.5"/>
    <circle cx="11" cy="9" r="4" fill="white" opacity="0.9"/>
  </svg>`
  return L.divIcon({ html: svg, className: '', iconSize: [22, 30], iconAnchor: [11, 30], popupAnchor: [0, -32] })
}

const START_ICON = makePin('#16a34a', '#fff')
const END_ICON   = makePin('#dc2626', '#fff')

// Auto-fit the map to show all points
function AutoFit({ pts }: { pts: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (pts.length > 0) map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 })
  }, [pts.length])
  return null
}

// Deselect when clicking on the map background
function DeselectOnMapClick({ onDeselect }: { onDeselect: () => void }) {
  useMapEvents({ click: onDeselect })
  return null
}

// Map 0–1 to blue→green→yellow→red
function speedColor(t: number): string {
  return `hsl(${Math.round(240 - t * 240)},90%,55%)`
}

// Speed-colored polyline segments; supports dimming + bold for selection
function SpeedPolyline({
  points, popup, weight, opacity,
}: {
  points: number[][]
  popup: React.ReactNode
  weight: number
  opacity: number
}) {
  const latLngs = points.map(p => [p[0], p[1]] as [number, number])
  const speeds  = points.map(p => (p[2] as number | null | undefined) ?? null)
  const valid   = speeds.filter((s): s is number => s !== null && s > 0)

  if (valid.length < 2) {
    return (
      <Polyline positions={latLngs} pathOptions={{ color: '#94a3b8', weight, opacity }}>
        {popup}
      </Polyline>
    )
  }

  const minS = Math.min(...valid), maxS = Math.max(...valid), range = maxS - minS || 1
  const LEVELS = 8
  const levelOf = (s: number | null) =>
    s === null || s <= 0 ? 0 : Math.min(LEVELS - 1, Math.floor(((s - minS) / range) * LEVELS))

  type Seg = { pts: [number, number][]; lvl: number }
  const segs: Seg[] = []
  let cur: [number, number][] = [latLngs[0]]
  let curLvl = levelOf(speeds[0])
  for (let i = 1; i < latLngs.length; i++) {
    const lvl = levelOf(speeds[i])
    cur.push(latLngs[i])
    if (lvl !== curLvl) {
      segs.push({ pts: [...cur], lvl: curLvl })
      cur = [latLngs[i]]
      curLvl = lvl
    }
  }
  if (cur.length > 1) segs.push({ pts: cur, lvl: curLvl })

  return (
    <>
      {segs.map((seg, i) => (
        <Polyline
          key={i}
          positions={seg.pts}
          pathOptions={{ color: speedColor(seg.lvl / (LEVELS - 1)), weight, opacity }}
        >
          {i === 0 ? popup : null}
        </Polyline>
      ))}
    </>
  )
}

function fmtType(t: string) {
  return t.split('_').map(w => w[0] + w.slice(1).toLowerCase()).join(' ')
}

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

function ActivityPopup({ a }: { a: MapActivity }) {
  const startDate = new Date(a.start_time)
  const endDate   = a.duration_seconds ? new Date(startDate.getTime() + a.duration_seconds * 1000) : null
  const timeFmt   = (d: Date) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  return (
    <Popup>
      <div style={{ fontSize: 13, minWidth: 190 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{a.name}</div>
        <div style={{ color: '#888', fontSize: 11, marginBottom: 6 }}>
          {startDate.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          {' · '}{a.activity_type.replace(/_/g, ' ')}
        </div>
        <div style={{ color: '#aaa', fontSize: 11, marginBottom: 8 }}>
          {timeFmt(startDate)}{endDate ? ` – ${timeFmt(endDate)}` : ''}
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
}

interface Props {
  start: string
  end: string
  highlightedId?: number | null
  onRangeChange?: (start: string, end: string) => void
}

export default function ActivityMap({ start: defaultStart, end: defaultEnd, highlightedId, onRangeChange }: Props) {
  const [rangeStart, setRangeStart] = useState(defaultStart)
  const [rangeEnd,   setRangeEnd]   = useState(defaultEnd)
  const [fetched,    setFetched]    = useState({ start: defaultStart, end: defaultEnd })
  const [data,       setData]       = useState<MapActivity[]>([])
  const [loading,    setLoading]    = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>('All')

  useEffect(() => {
    setRangeStart(defaultStart)
    setRangeEnd(defaultEnd)
    setFetched({ start: defaultStart, end: defaultEnd })
  }, [defaultStart, defaultEnd])

  // Highlight from external source (Personal Bests click)
  useEffect(() => {
    if (highlightedId != null) setSelectedId(highlightedId)
  }, [highlightedId])

  useEffect(() => {
    setLoading(true)
    fetchMapActivities(fetched.start, fetched.end)
      .then(d => { setData(d); setSelectedId(null); setTypeFilter('All') })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [fetched.start, fetched.end])

  function apply() {
    if (rangeStart && rangeEnd && rangeStart <= rangeEnd) {
      setFetched({ start: rangeStart, end: rangeEnd })
      onRangeChange?.(rangeStart, rangeEnd)
    }
  }

  const located = data.filter(a => a.start_lat != null && a.start_lng != null)

  const availableTypes = ['All', ...Array.from(new Set(data.map(a => a.activity_type))).sort()]
  const visible = typeFilter === 'All' ? located : located.filter(a => a.activity_type === typeFilter)

  const allPts: [number, number][] = visible.flatMap(a => {
    const pts: [number, number][] = [[a.start_lat!, a.start_lng!]]
    if (a.polyline?.length) a.polyline.forEach(p => pts.push([p[0], p[1]]))
    return pts
  })

  const hasAnyRoute = visible.some(a => (a.polyline?.length ?? 0) > 2)
  const isCustom    = fetched.start !== defaultStart || fetched.end !== defaultEnd
  const anySelected = selectedId !== null

  // Render non-selected first, selected last (so it draws on top)
  const sorted = selectedId == null
    ? visible
    : [...visible.filter(a => a.activity_id !== selectedId), visible.find(a => a.activity_id === selectedId)!]

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      {/* Header + date range picker */}
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-300">Activity Map</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {loading ? 'Loading…' : `${visible.length} activities${typeFilter !== 'All' ? ` (${fmtType(typeFilter)})` : ''}${hasAnyRoute ? ' · paths colored by speed' : ''}${anySelected ? ' · click map to deselect' : ''}`}
          </p>
        </div>

        <div className="flex items-center gap-2 ml-auto flex-wrap">
          {availableTypes.length > 2 && (
            <select
              value={typeFilter}
              onChange={e => { setTypeFilter(e.target.value); setSelectedId(null) }}
              className="bg-slate-700 text-slate-200 text-xs rounded-md px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-blue-500"
            >
              {availableTypes.map(t => (
                <option key={t} value={t}>{t === 'All' ? 'All types' : fmtType(t)}</option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-slate-400">From</label>
            <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)}
              className="bg-slate-700 text-slate-200 text-xs rounded-md px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-blue-500" />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-slate-400">To</label>
            <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)}
              className="bg-slate-700 text-slate-200 text-xs rounded-md px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-blue-500" />
          </div>
          <button onClick={apply} disabled={!rangeStart || !rangeEnd || rangeStart > rangeEnd}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors">
            Show
          </button>
          {isCustom && (
            <button onClick={() => { setRangeStart(defaultStart); setRangeEnd(defaultEnd); setFetched({ start: defaultStart, end: defaultEnd }) }}
              className="px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors">
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
            <DeselectOnMapClick onDeselect={() => setSelectedId(null)} />

            {sorted.map(a => {
              const isSelected = a.activity_id === selectedId
              const isDimmed   = anySelected && !isSelected
              const hasRoute   = (a.polyline?.length ?? 0) > 2

              const endLat = a.end_lat ?? (hasRoute ? a.polyline![a.polyline!.length - 1][0] : null)
              const endLng = a.end_lng ?? (hasRoute ? a.polyline![a.polyline!.length - 1][1] : null)

              const routeWeight  = isSelected ? 5 : 3
              const routeOpacity = isDimmed ? 0.15 : 0.9
              const pinOpacity   = isDimmed ? 0.25 : 1

              const popup = <ActivityPopup a={a} />
              const selectHandler = { click: (e: L.LeafletMouseEvent) => { L.DomEvent.stopPropagation(e); setSelectedId(a.activity_id) } }

              return (
                <Fragment key={a.activity_id}>
                  {hasRoute && (
                    <SpeedPolyline points={a.polyline!} popup={popup} weight={routeWeight} opacity={routeOpacity} />
                  )}

                  {/* Start pin */}
                  <Marker
                    position={[a.start_lat!, a.start_lng!]}
                    icon={START_ICON}
                    opacity={pinOpacity}
                    eventHandlers={selectHandler}
                  >
                    {popup}
                  </Marker>

                  {/* End pin */}
                  {endLat != null && endLng != null && (
                    <Marker
                      position={[endLat, endLng]}
                      icon={END_ICON}
                      opacity={pinOpacity}
                      eventHandlers={selectHandler}
                    >
                      {popup}
                    </Marker>
                  )}
                </Fragment>
              )
            })}
          </MapContainer>
        </div>
      )}

      {/* Legend */}
      {located.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-3.5 bg-green-600" style={{ clipPath: 'polygon(50% 100%, 0 40%, 20% 0, 80% 0, 100% 40%)' }} />
            <span className="text-xs text-slate-400">start</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-3.5 bg-red-600" style={{ clipPath: 'polygon(50% 100%, 0 40%, 20% 0, 80% 0, 100% 40%)' }} />
            <span className="text-xs text-slate-400">end</span>
          </div>
          {hasAnyRoute && (
            <div className="flex items-center gap-2 ml-2">
              <span className="text-xs text-slate-500">slow</span>
              <div className="flex h-2 w-24 rounded overflow-hidden">
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i} className="flex-1" style={{ backgroundColor: speedColor(i / 7) }} />
                ))}
              </div>
              <span className="text-xs text-slate-500">fast</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
