import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import type { WeatherGridPoint } from '../types'

export type WeatherVariable = 'temperature' | 'precipitation' | 'wind_speed'

interface Props {
  points: WeatherGridPoint[]
  variable: WeatherVariable
  hour: number
  date?: string
  opacity?: number
  /** Fixed normalization range — computed from the full dataset so colors stay consistent across hours */
  dataMin?: number
  dataMax?: number
}

// ─── Color scales (t is normalized 0–1 from actual data min/max) ─────────────

function hsl(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}

function valueToColor(t: number, variable: WeatherVariable): [number, number, number] {
  switch (variable) {
    case 'temperature':   return hsl(240 - t * 240, 90, 55)
    case 'precipitation': return hsl(210, 70 + t * 20, 70 - t * 35)
    case 'wind_speed':    return hsl(120 - t * 120, 90, 55)
  }
}

// ─── Bilinear interpolation ───────────────────────────────────────────────────

function bilinear(
  lats: number[],
  lngs: number[],
  lookup: Map<string, number>,
  lat: number,
  lng: number,
): number | null {
  let li = -1, gi = -1
  for (let i = 0; i < lats.length - 1; i++) {
    if (lats[i] <= lat && lat <= lats[i + 1]) { li = i; break }
  }
  for (let i = 0; i < lngs.length - 1; i++) {
    if (lngs[i] <= lng && lng <= lngs[i + 1]) { gi = i; break }
  }
  if (li < 0 || gi < 0) return null
  const la0 = lats[li], la1 = lats[li + 1]
  const lg0 = lngs[gi], lg1 = lngs[gi + 1]
  const v00 = lookup.get(`${la0},${lg0}`)
  const v01 = lookup.get(`${la0},${lg1}`)
  const v10 = lookup.get(`${la1},${lg0}`)
  const v11 = lookup.get(`${la1},${lg1}`)
  if (v00 == null || v01 == null || v10 == null || v11 == null) return null
  const t = (lat - la0) / (la1 - la0)
  const u = (lng - lg0) / (lg1 - lg0)
  return (1 - t) * (1 - u) * v00 + (1 - t) * u * v01 + t * (1 - u) * v10 + t * u * v11
}

// ─── Render ERA5 grid to a data-URL ──────────────────────────────────────────

function renderToDataURL(
  points: WeatherGridPoint[],
  variable: WeatherVariable,
  hour: number,
  date: string | undefined,
  dataMin: number | undefined,
  dataMax: number | undefined,
  resolution = 256,
): { dataUrl: string; bounds: L.LatLngBoundsExpression } | null {
  const field = variable === 'temperature' ? 'temperature_2m'
              : variable === 'precipitation' ? 'precipitation'
              : 'wind_speed_10m'

  let filtered = points.filter(p => p.hour === hour)
  if (date) filtered = filtered.filter(p => p.date === date)
  if (filtered.length < 4) return null

  const lats = [...new Set(filtered.map(p => p.lat))].sort((a, b) => a - b)
  const lngs = [...new Set(filtered.map(p => p.lng))].sort((a, b) => a - b)
  if (lats.length < 2 || lngs.length < 2) return null

  // Use caller-supplied range (full dataset) so colors are consistent across hours.
  // Fall back to computing from the filtered slice only if not provided.
  let min = dataMin, max = dataMax
  if (min == null || max == null) {
    const rawValues = filtered
      .map(p => p[field as keyof WeatherGridPoint] as number | null)
      .filter((v): v is number => v != null)
    if (!rawValues.length) return null
    min = Math.min(...rawValues)
    max = Math.max(...rawValues)
  }
  const range = (max - min) || 1

  const lookup = new Map<string, number>()
  for (const p of filtered) {
    const v = p[field as keyof WeatherGridPoint] as number | null
    if (v != null) lookup.set(`${p.lat},${p.lng}`, v)
  }

  const minLat = lats[0], maxLat = lats[lats.length - 1]
  const minLng = lngs[0], maxLng = lngs[lngs.length - 1]

  const canvas = document.createElement('canvas')
  canvas.width  = resolution
  canvas.height = resolution
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(resolution, resolution)

  for (let py = 0; py < resolution; py++) {
    for (let px = 0; px < resolution; px++) {
      const lat = maxLat - (py / (resolution - 1)) * (maxLat - minLat)
      const lng = minLng + (px / (resolution - 1)) * (maxLng - minLng)
      const val = bilinear(lats, lngs, lookup, lat, lng)
      if (val == null) continue
      if (variable === 'precipitation' && val <= 0.05) continue
      const t = Math.max(0, Math.min(1, (val - min!) / range))
      const [r, g, b] = valueToColor(t, variable)
      const idx = (py * resolution + px) * 4
      img.data[idx]     = r
      img.data[idx + 1] = g
      img.data[idx + 2] = b
      img.data[idx + 3] = 170
    }
  }
  ctx.putImageData(img, 0, 0)

  return {
    dataUrl: canvas.toDataURL('image/png'),
    bounds:  [[minLat, minLng], [maxLat, maxLng]],
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WeatherGridLayer({ points, variable, hour, date, opacity = 1, dataMin, dataMax }: Props) {
  const map     = useMap()
  const overlay = useRef<L.ImageOverlay | null>(null)

  useEffect(() => {
    const result = renderToDataURL(points, variable, hour, date, dataMin, dataMax)
    if (!result) {
      overlay.current?.remove()
      overlay.current = null
      return
    }
    if (overlay.current) {
      overlay.current.setUrl(result.dataUrl)
      overlay.current.setBounds(result.bounds as L.LatLngBounds)
      overlay.current.setOpacity(opacity)
    } else {
      overlay.current = L.imageOverlay(result.dataUrl, result.bounds, {
        opacity,
        zIndex: 400,
        interactive: false,
      }).addTo(map)
    }
    return () => {
      overlay.current?.remove()
      overlay.current = null
    }
  }, [map, points, variable, hour, date, opacity, dataMin, dataMax])

  return null
}

// ─── Legend component ─────────────────────────────────────────────────────────

const UNITS: Record<WeatherVariable, string> = {
  temperature:   '°C',
  precipitation: 'mm/h',
  wind_speed:    'km/h',
}

const GRADIENTS: Record<WeatherVariable, string> = {
  temperature:   'linear-gradient(to right, hsl(240,90%,55%), hsl(180,90%,55%), hsl(120,90%,55%), hsl(60,90%,55%), hsl(0,90%,55%))',
  precipitation: 'linear-gradient(to right, hsl(210,70%,70%), hsl(210,80%,52%), hsl(210,90%,35%))',
  wind_speed:    'linear-gradient(to right, hsl(120,90%,55%), hsl(60,90%,55%), hsl(0,90%,55%))',
}

export function WeatherGridLegend({
  variable,
  min,
  max,
}: {
  variable: WeatherVariable
  min?: number
  max?: number
}) {
  const unit = UNITS[variable]
  const fmt = (v: number) =>
    variable === 'temperature' ? `${v.toFixed(0)}${unit}` : `${v.toFixed(1)} ${unit}`
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500">{min != null ? fmt(min) : '—'}</span>
      <div className="h-2 w-24 rounded overflow-hidden" style={{ background: GRADIENTS[variable] }} />
      <span className="text-xs text-slate-500">{max != null ? fmt(max) : '—'}</span>
    </div>
  )
}
