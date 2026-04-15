import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, useMap } from 'react-leaflet'
import type { MapActivity } from '../types'
import { fetchMapActivities } from '../api'

const TYPE_COLORS: Record<string, string> = {
  RUNNING:              '#2dd4bf',
  TRAIL_RUNNING:        '#2dd4bf',
  CYCLING:              '#34d399',
  MOUNTAIN_BIKING:      '#34d399',
  VIRTUAL_RIDE:         '#34d399',
  HIKING:               '#f59e0b',
  WALKING:              '#60a5fa',
  SWIMMING:             '#818cf8',
  OPEN_WATER_SWIMMING:  '#818cf8',
  STRENGTH_TRAINING:    '#f87171',
  YOGA:                 '#c084fc',
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

function AutoFit({ pts }: { pts: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (pts.length > 0) map.fitBounds(pts, { padding: [30, 30], maxZoom: 14 })
  }, [pts.length])
  return null
}

interface Props { start: string; end: string }

export default function ActivityMap({ start, end }: Props) {
  const [data, setData] = useState<MapActivity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchMapActivities(start, end)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [start, end])

  const located = data.filter(a => a.start_lat != null && a.start_lng != null)
  const pts = located.map(a => [a.start_lat!, a.start_lng!] as [number, number])

  const presentTypes = [...new Set(located.map(a => a.activity_type))]

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-300 mb-1">Activity Map</h3>
      <p className="text-xs text-slate-500 mb-3">
        {loading ? 'Loading…' : `${located.length} activities with GPS · routes fill in as sync runs`}
      </p>

      {!loading && located.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-slate-500 text-sm rounded-lg bg-slate-700/40">
          No GPS data yet — sync populates this automatically for outdoor activities
        </div>
      ) : (
        <div className="rounded-lg overflow-hidden" style={{ height: 460 }}>
          <MapContainer center={[0, 0]} zoom={2} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            />
            {pts.length > 0 && <AutoFit pts={pts} />}

            {located.map(a => {
              const clr = color(a.activity_type)
              const hasRoute = a.polyline && a.polyline.length > 2

              const popup = (
                <Popup>
                  <div style={{ fontSize: 13, minWidth: 170 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{a.name}</div>
                    <div style={{ color: '#888', fontSize: 11, marginBottom: 6 }}>
                      {new Date(a.start_time).toLocaleDateString()} · {a.activity_type.replace(/_/g, ' ')}
                    </div>
                    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                      <tbody>
                        {a.distance_meters && <tr><td style={{ color: '#aaa', paddingRight: 8 }}>Distance</td><td>{fmtDist(a.distance_meters)}</td></tr>}
                        <tr><td style={{ color: '#aaa', paddingRight: 8 }}>Duration</td><td>{fmtDur(a.duration_seconds)}</td></tr>
                        {a.avg_pace_sec_per_km && <tr><td style={{ color: '#aaa', paddingRight: 8 }}>Pace</td><td>{fmtPace(a.avg_pace_sec_per_km)}</td></tr>}
                        {a.avg_hr && <tr><td style={{ color: '#aaa', paddingRight: 8 }}>Avg HR</td><td>{a.avg_hr} bpm</td></tr>}
                        {a.elevation_gain_m && <tr><td style={{ color: '#aaa', paddingRight: 8 }}>Elevation</td><td>+{Math.round(a.elevation_gain_m)} m</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </Popup>
              )

              return hasRoute ? (
                <Polyline
                  key={a.activity_id}
                  positions={a.polyline!}
                  pathOptions={{ color: clr, weight: 2.5, opacity: 0.85 }}
                >
                  {popup}
                </Polyline>
              ) : (
                <CircleMarker
                  key={a.activity_id}
                  center={[a.start_lat!, a.start_lng!]}
                  radius={5}
                  pathOptions={{ color: clr, fillColor: clr, fillOpacity: 0.85, weight: 1 }}
                >
                  {popup}
                </CircleMarker>
              )
            })}
          </MapContainer>
        </div>
      )}

      {/* Legend */}
      {presentTypes.length > 0 && (
        <div className="flex flex-wrap gap-3 mt-3">
          {presentTypes.map(type => (
            <div key={type} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color(type) }} />
              <span className="text-xs text-slate-400">{type.replace(/_/g, ' ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
