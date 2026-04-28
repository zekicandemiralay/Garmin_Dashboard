import { useEffect, useState } from 'react'
import { fetchCountryStats } from '../api'
import type { CountryStat, CountryTypeStat } from '../types'

const nameOf = (() => {
  const fmt = new Intl.DisplayNames(['en'], { type: 'region' })
  return (code: string) => { try { return fmt.of(code) ?? code } catch { return code } }
})()

function flagOf(code: string): string {
  return code.toUpperCase().split('').map(c => String.fromCodePoint(c.charCodeAt(0) + 0x1F1A5)).join('')
}

function fmtType(t: string) {
  return t.split('_').map(w => w[0] + w.slice(1).toLowerCase()).join(' ')
}

function fmtKm(km: number)  { return km >= 1 ? `${km.toFixed(0)} km`  : `${(km * 1000).toFixed(0)} m` }
function fmtHr(h: number)   { return h >= 1  ? `${h.toFixed(0)}h`     : `${(h * 60).toFixed(0)}m` }
function fmtElev(m: number) { return m > 0   ? `+${m.toLocaleString()} m` : '—' }

const TYPE_COLOR: Record<string, string> = {
  CYCLING:         'bg-blue-500/20 text-blue-300',
  TRAIL_RUNNING:   'bg-orange-500/20 text-orange-300',
  RUNNING:         'bg-yellow-500/20 text-yellow-300',
  HIKING:          'bg-green-500/20 text-green-300',
  WALKING:         'bg-teal-500/20 text-teal-300',
  SWIMMING:        'bg-cyan-500/20 text-cyan-300',
  OPEN_WATER_SWIMMING: 'bg-cyan-500/20 text-cyan-300',
  MOUNTAIN_BIKING: 'bg-purple-500/20 text-purple-300',
}
function typeColor(t: string) { return TYPE_COLOR[t] ?? 'bg-slate-500/20 text-slate-300' }

function TypeRow({ t }: { t: CountryTypeStat }) {
  return (
    <tr className="border-t border-slate-700/50 text-xs">
      <td className="py-1.5 pl-6 pr-2">
        <span className={`px-2 py-0.5 rounded-full font-medium ${typeColor(t.type)}`}>
          {fmtType(t.type)}
        </span>
      </td>
      <td className="py-1.5 px-2 text-right text-slate-400">{t.count}</td>
      <td className="py-1.5 px-2 text-right text-slate-200">{t.total_km > 0 ? fmtKm(t.total_km) : '—'}</td>
      <td className="py-1.5 px-2 text-right text-slate-300">{fmtHr(t.total_hours)}</td>
      <td className="py-1.5 px-2 text-right text-slate-400">{fmtElev(t.total_elevation_m)}</td>
      <td className="py-1.5 pl-2 pr-3 text-right text-slate-400">{t.avg_hr ? `${t.avg_hr} bpm` : '—'}</td>
    </tr>
  )
}

function CountryRow({ c }: { c: CountryStat }) {
  const [open, setOpen] = useState(false)
  const name = nameOf(c.country)
  const flag = flagOf(c.country)

  return (
    <>
      <tr
        className="border-t border-slate-700 cursor-pointer hover:bg-slate-700/40 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-2">
            <span className="text-lg leading-none">{flag}</span>
            <div>
              <div className="text-sm font-medium text-slate-200">{name}</div>
              <div className="text-xs text-slate-500">{c.total_activities} activities</div>
            </div>
          </div>
        </td>
        <td className="py-2.5 px-3 text-right">
          <span className="text-sm font-semibold text-slate-100">{c.total_km > 0 ? fmtKm(c.total_km) : '—'}</span>
        </td>
        <td className="py-2.5 px-3 text-right text-sm text-slate-300">{fmtHr(c.total_hours)}</td>
        <td className="py-2.5 px-3 text-right text-sm text-slate-400">{fmtElev(c.total_elevation_m)}</td>
        <td className="py-2.5 px-3 text-right">
          <div className="flex flex-wrap gap-1 justify-end">
            {c.types.map(t => (
              <span key={t.type} className={`text-xs px-1.5 py-0.5 rounded-full ${typeColor(t.type)}`}>
                {fmtType(t.type)}
              </span>
            ))}
          </div>
        </td>
        <td className="py-2.5 px-3 text-slate-500 text-xs text-right">
          {open ? '▲' : '▼'}
        </td>
      </tr>

      {open && (
        <tr>
          <td colSpan={6} className="p-0 bg-slate-800/60">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-slate-500">
                  <th className="pl-6 pr-2 py-1 text-left font-normal">Type</th>
                  <th className="px-2 py-1 text-right font-normal">Count</th>
                  <th className="px-2 py-1 text-right font-normal">Distance</th>
                  <th className="px-2 py-1 text-right font-normal">Time</th>
                  <th className="px-2 py-1 text-right font-normal">Elevation</th>
                  <th className="pl-2 pr-3 py-1 text-right font-normal">Avg HR</th>
                </tr>
              </thead>
              <tbody>
                {c.types.map(t => <TypeRow key={t.type} t={t} />)}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  )
}

interface Props {
  start: string
  end: string
}

export default function CountryStats({ start, end }: Props) {
  const [data, setData] = useState<CountryStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchCountryStats(start, end)
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [start, end])

  if (loading) return null
  if (data.length === 0) return null

  const totalKm = data.reduce((s, c) => s + c.total_km, 0)

  return (
    <div className="bg-slate-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-300">Countries</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {data.length} {data.length === 1 ? 'country' : 'countries'} · {fmtKm(totalKm)} total · click a row to expand
          </p>
        </div>
      </div>
      <table className="w-full">
        <thead>
          <tr className="text-xs text-slate-500 bg-slate-800/80">
            <th className="px-3 py-2 text-left font-normal">Country</th>
            <th className="px-3 py-2 text-right font-normal">Distance</th>
            <th className="px-3 py-2 text-right font-normal">Time</th>
            <th className="px-3 py-2 text-right font-normal">Elevation</th>
            <th className="px-3 py-2 text-right font-normal">Types</th>
            <th className="px-3 py-2 text-right font-normal w-6" />
          </tr>
        </thead>
        <tbody>
          {data.map(c => <CountryRow key={c.country} c={c} />)}
        </tbody>
      </table>
    </div>
  )
}
