import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import type { WeatherGridPoint } from '../types'

export type WeatherVariable = 'temperature' | 'precipitation' | 'wind_speed'

interface Props {
  points: WeatherGridPoint[]
  variable: WeatherVariable
  hour: number
  opacity?: number
}

// ─── Color scales ─────────────────────────────────────────────────────────────

function hsl(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}

function tempColor(t: number): [number, number, number] {
  const stops = [-20, 0, 10, 20, 35]
  const hues  = [240, 180, 120, 60, 0]
  if (t <= stops[0]) return hsl(hues[0], 90, 55)
  if (t >= stops[stops.length - 1]) return hsl(hues[hues.length - 1], 90, 55)
  for (let i = 0; i < stops.length - 1; i++) {
    if (t <= stops[i + 1]) {
      const frac = (t - stops[i]) / (stops[i + 1] - stops[i])
      return hsl(hues[i] + frac * (hues[i + 1] - hues[i]), 90, 55)
    }
  }
  return [128, 128, 128]
}

function precipColor(p: number): [number, number, number] {
  const t = Math.min(1, p / 8)
  return hsl(210, 70 + t * 20, 70 - t * 35)
}

function windColor(v: number): [number, number, number] {
  const t = Math.min(1, v / 60)
  return hsl(120 - t * 120, 90, 55)
}

function valueToColor(value: number, variable: WeatherVariable): [number, number, number] {
  switch (variable) {
    case 'temperature':   return tempColor(value)
    case 'precipitation': return precipColor(value)
    case 'wind_speed':    return windColor(value)
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

// ─── Render ERA5 grid to a data-URL (offscreen canvas, then L.imageOverlay) ──

function renderToDataURL(
  points: WeatherGridPoint[],
  variable: WeatherVariable,
  hour: number,
  resolution = 256,
): { dataUrl: string; bounds: L.LatLngBoundsExpression } | null {
  const field = variable === 'temperature' ? 'temperature_2m'
              : variable === 'precipitation' ? 'precipitation'
              : 'wind_speed_10m'

  const filtered = points.filter(p => p.hour === hour)
  if (filtered.length < 4) return null

  const lats = [...new Set(filtered.map(p => p.lat))].sort((a, b) => a - b)
  const lngs = [...new Set(filtered.map(p => p.lng))].sort((a, b) => a - b)
  if (lats.length < 2 || lngs.length < 2) return null

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
      // py=0 → maxLat (top), py=res-1 → minLat (bottom)
      const lat = maxLat - (py / (resolution - 1)) * (maxLat - minLat)
      const lng = minLng + (px / (resolution - 1)) * (maxLng - minLng)
      const val = bilinear(lats, lngs, lookup, lat, lng)
      if (val == null) continue
      if (variable === 'precipitation' && val <= 0.05) continue
      const [r, g, b] = valueToColor(val, variable)
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

export default function WeatherGridLayer({ points, variable, hour, opacity = 1 }: Props) {
  const map     = useMap()
  const overlay = useRef<L.ImageOverlay | null>(null)

  useEffect(() => {
    const result = renderToDataURL(points, variable, hour)
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
  }, [map, points, variable, hour, opacity])

  return null
}

// ─── Legend component ─────────────────────────────────────────────────────────

const LEGENDS: Record<WeatherVariable, { label: string; stops: { value: number; color: string }[] }> = {
  temperature: {
    label: '°C',
    stops: [
      { value: -20, color: 'hsl(240,90%,55%)' },
      { value: 0,   color: 'hsl(180,90%,55%)' },
      { value: 10,  color: 'hsl(120,90%,55%)' },
      { value: 20,  color: 'hsl(60,90%,55%)'  },
      { value: 35,  color: 'hsl(0,90%,55%)'   },
    ],
  },
  precipitation: {
    label: 'mm/h',
    stops: [
      { value: 0,  color: 'hsl(210,70%,70%)' },
      { value: 4,  color: 'hsl(210,80%,52%)' },
      { value: 8,  color: 'hsl(210,90%,35%)' },
    ],
  },
  wind_speed: {
    label: 'km/h',
    stops: [
      { value: 0,  color: 'hsl(120,90%,55%)' },
      { value: 30, color: 'hsl(60,90%,55%)'  },
      { value: 60, color: 'hsl(0,90%,55%)'   },
    ],
  },
}

export function WeatherGridLegend({ variable }: { variable: WeatherVariable }) {
  const { label, stops } = LEGENDS[variable]
  const gradient = `linear-gradient(to right, ${stops.map(s => s.color).join(', ')})`
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500">{stops[0].value}{label}</span>
      <div className="h-2 w-24 rounded overflow-hidden" style={{ background: gradient }} />
      <span className="text-xs text-slate-500">{stops[stops.length - 1].value}{label}</span>
    </div>
  )
}
