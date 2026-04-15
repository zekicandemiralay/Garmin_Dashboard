import { useState } from 'react'
import type { Activity } from '../types'
import type { DailyRow } from '../types'

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtPace(v: number | null) {
  if (!v) return '—'
  return `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')} /km`
}
function fmtDist(m: number | null) {
  if (!m) return '—'
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`
}
function fmtDur(s: number | null) {
  if (!s) return '—'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtSpeed(a: Activity) {
  const mps = a.avg_speed_mps ?? (
    a.distance_meters && a.duration_seconds ? a.distance_meters / a.duration_seconds : null
  )
  return mps ? `${(mps * 3.6).toFixed(1)} km/h` : '—'
}

// ── Modal ─────────────────────────────────────────────────────────────────────

type ColAlign = 'left' | 'right'

interface ColDef {
  header: string
  align?: ColAlign
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cell: (row: any, rank: number) => string | number | null
}

interface ModalCfg {
  title: string
  subtitle: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[]
  cols: ColDef[]
}

function Modal({ cfg, onClose }: { cfg: ModalCfg; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-700 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">{cfg.title}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{cfg.subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl leading-none ml-4 mt-0.5"
          >
            ×
          </button>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-slate-900">
              <tr>
                {cfg.cols.map(c => (
                  <th
                    key={c.header}
                    className={`px-4 py-2.5 text-xs font-medium text-slate-400 whitespace-nowrap ${
                      c.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cfg.rows.map((row, i) => (
                <tr
                  key={i}
                  className={`border-t border-slate-700/50 ${
                    i === 0 ? 'bg-amber-500/10' : i % 2 === 0 ? 'bg-slate-800/50' : ''
                  }`}
                >
                  {cfg.cols.map(c => (
                    <td
                      key={c.header}
                      className={`px-4 py-2 text-slate-300 whitespace-nowrap ${
                        c.align === 'right' ? 'text-right tabular-nums' : ''
                      } ${i === 0 ? 'font-medium' : ''}`}
                    >
                      {c.cell(row, i + 1) ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-2.5 border-t border-slate-700 text-xs text-slate-500 shrink-0">
          {cfg.rows.length} entries · click outside to close
        </div>
      </div>
    </div>
  )
}

// ── Activity column presets ───────────────────────────────────────────────────

const A_RANK:  ColDef = { header: '#',          align: 'right',  cell: (_, r) => r }
const A_DATE:  ColDef = { header: 'Date',                        cell: a => fmtDate(a.start_time) }
const A_NAME:  ColDef = { header: 'Activity',                    cell: a => a.name }
const A_TYPE:  ColDef = { header: 'Type',                        cell: a => (a.activity_type as string).replace(/_/g, ' ') }
const A_DIST:  ColDef = { header: 'Distance',   align: 'right',  cell: a => fmtDist(a.distance_meters) }
const A_DUR:   ColDef = { header: 'Duration',   align: 'right',  cell: a => fmtDur(a.duration_seconds) }
const A_PACE:  ColDef = { header: 'Avg Pace',   align: 'right',  cell: a => fmtPace(a.avg_pace_sec_per_km) }
const A_SPD:   ColDef = { header: 'Avg Speed',  align: 'right',  cell: (a: Activity) => fmtSpeed(a) }
const A_ELEV:  ColDef = { header: 'Elevation',  align: 'right',  cell: a => a.elevation_gain_m ? `+${Math.round(a.elevation_gain_m)} m` : '—' }
const A_HR:    ColDef = { header: 'Avg HR',     align: 'right',  cell: a => a.avg_hr ? `${a.avg_hr} bpm` : '—' }
const A_MAXHR: ColDef = { header: 'Max HR',     align: 'right',  cell: a => a.max_hr ? `${a.max_hr} bpm` : '—' }
const A_CAL:   ColDef = { header: 'Calories',   align: 'right',  cell: a => a.calories ? `${a.calories} kcal` : '—' }
const A_TE:    ColDef = { header: 'Aerobic TE', align: 'right',  cell: a => a.aerobic_te ? (a.aerobic_te as number).toFixed(1) : '—' }
const A_CAD:   ColDef = { header: 'Cadence',    align: 'right',  cell: a => a.avg_cadence ? `${a.avg_cadence} spm` : '—' }

// ── Daily column presets ──────────────────────────────────────────────────────

const D_RANK:   ColDef = { header: '#',           align: 'right', cell: (_, r) => r }
const D_DATE:   ColDef = { header: 'Date',                        cell: d => fmtDate(d.date) }
const D_STEPS:  ColDef = { header: 'Steps',       align: 'right', cell: d => d.steps ? (d.steps as number).toLocaleString() : '—' }
const D_DIST:   ColDef = { header: 'Distance',    align: 'right', cell: d => fmtDist(d.distance_meters) }
const D_ACT:    ColDef = { header: 'Active Time', align: 'right', cell: d => fmtDur(d.active_time_seconds) }
const D_BB:     ColDef = { header: 'Body Battery',align: 'right', cell: d => (d.body_battery_high && d.body_battery_low) ? `${d.body_battery_low}→${d.body_battery_high}` : '—' }
const D_RHR:    ColDef = { header: 'Resting HR',  align: 'right', cell: d => d.resting_hr ? `${d.resting_hr} bpm` : '—' }
const D_CAL:    ColDef = { header: 'Calories',    align: 'right', cell: d => d.total_calories ? `${d.total_calories} kcal` : '—' }
const D_STRESS: ColDef = { header: 'Stress',      align: 'right', cell: d => d.stress_avg != null ? String(d.stress_avg) : '—' }

// ── Main component ────────────────────────────────────────────────────────────

interface Props { activities: Activity[]; daily: DailyRow[] }

export default function PersonalBestsTable({ activities, daily }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (activities.length === 0 && daily.length === 0) return null

  const runs  = [...activities].filter(a => a.activity_type === 'RUNNING' && a.distance_meters)
  const rides = [...activities].filter(a =>
    (a.activity_type === 'CYCLING' || a.activity_type === 'MOUNTAIN_BIKING') && a.distance_meters
  )

  // ── Best cards definition ──────────────────────────────────
  type CardDef = {
    key: string
    label: string
    stat: string
    sub: string
    modal: () => ModalCfg
  }

  const cards: CardDef[] = []

  // Longest run
  const longestRun = [...runs].sort((a, b) => (b.distance_meters ?? 0) - (a.distance_meters ?? 0))[0]
  if (longestRun) cards.push({
    key: 'longest-run', label: 'Longest run',
    stat: fmtDist(longestRun.distance_meters),
    sub: `${longestRun.name} · ${fmtDate(longestRun.start_time)}`,
    modal: () => ({
      title: 'All Runs — by Distance',
      subtitle: `${runs.length} runs sorted longest to shortest`,
      rows: [...runs].sort((a, b) => (b.distance_meters ?? 0) - (a.distance_meters ?? 0)),
      cols: [A_RANK, A_DATE, A_NAME, A_DIST, A_DUR, A_PACE, A_ELEV, A_HR, A_CAL],
    }),
  })

  // Fastest pace
  const fastRuns = runs.filter(a => (a.distance_meters ?? 0) > 2000 && a.avg_pace_sec_per_km)
  const fastestPace = [...fastRuns].sort((a, b) => (a.avg_pace_sec_per_km ?? 999) - (b.avg_pace_sec_per_km ?? 999))[0]
  if (fastestPace) cards.push({
    key: 'fastest-pace', label: 'Fastest run pace',
    stat: fmtPace(fastestPace.avg_pace_sec_per_km),
    sub: `${fastestPace.name} · ${fmtDate(fastestPace.start_time)}`,
    modal: () => ({
      title: 'All Runs — by Pace (fastest first)',
      subtitle: 'Only runs longer than 2 km · lower pace = faster',
      rows: [...fastRuns].sort((a, b) => (a.avg_pace_sec_per_km ?? 999) - (b.avg_pace_sec_per_km ?? 999)),
      cols: [A_RANK, A_DATE, A_NAME, A_PACE, A_DIST, A_DUR, A_HR, A_CAD],
    }),
  })

  // Longest ride
  const longestRide = [...rides].sort((a, b) => (b.distance_meters ?? 0) - (a.distance_meters ?? 0))[0]
  if (longestRide) cards.push({
    key: 'longest-ride', label: 'Longest ride',
    stat: fmtDist(longestRide.distance_meters),
    sub: `${longestRide.name} · ${fmtDate(longestRide.start_time)}`,
    modal: () => ({
      title: 'All Rides — by Distance',
      subtitle: `${rides.length} cycling activities sorted longest to shortest`,
      rows: [...rides].sort((a, b) => (b.distance_meters ?? 0) - (a.distance_meters ?? 0)),
      cols: [A_RANK, A_DATE, A_NAME, A_DIST, A_DUR, A_SPD, A_ELEV, A_HR, A_CAL],
    }),
  })

  // Fastest ride
  const fastestRide = [...rides].filter(a => a.avg_speed_mps || (a.distance_meters && a.duration_seconds))
    .sort((a, b) => {
      const sa = a.avg_speed_mps ?? (a.distance_meters! / a.duration_seconds!)
      const sb = b.avg_speed_mps ?? (b.distance_meters! / b.duration_seconds!)
      return sb - sa
    })[0]
  if (fastestRide) cards.push({
    key: 'fastest-ride', label: 'Fastest ride avg',
    stat: fmtSpeed(fastestRide),
    sub: `${fastestRide.name} · ${fmtDate(fastestRide.start_time)}`,
    modal: () => ({
      title: 'All Rides — by Avg Speed (fastest first)',
      subtitle: `${rides.length} cycling activities`,
      rows: [...rides].sort((a, b) => {
        const sa = a.avg_speed_mps ?? (a.distance_meters! / a.duration_seconds!)
        const sb = b.avg_speed_mps ?? (b.distance_meters! / b.duration_seconds!)
        return sb - sa
      }),
      cols: [A_RANK, A_DATE, A_NAME, A_SPD, A_DIST, A_DUR, A_ELEV, A_HR, A_CAL],
    }),
  })

  // Longest activity
  const withDur = activities.filter(a => a.duration_seconds)
  const longestAct = [...withDur].sort((a, b) => (b.duration_seconds ?? 0) - (a.duration_seconds ?? 0))[0]
  if (longestAct) cards.push({
    key: 'longest-activity', label: 'Longest activity',
    stat: fmtDur(longestAct.duration_seconds),
    sub: `${longestAct.name} · ${fmtDate(longestAct.start_time)}`,
    modal: () => ({
      title: 'All Activities — by Duration',
      subtitle: `${withDur.length} activities sorted longest first`,
      rows: [...withDur].sort((a, b) => (b.duration_seconds ?? 0) - (a.duration_seconds ?? 0)),
      cols: [A_RANK, A_DATE, A_TYPE, A_NAME, A_DUR, A_DIST, A_ELEV, A_HR, A_CAL, A_TE],
    }),
  })

  // Most elevation
  const withElev = activities.filter(a => (a.elevation_gain_m ?? 0) > 0)
  const mostElev = [...withElev].sort((a, b) => (b.elevation_gain_m ?? 0) - (a.elevation_gain_m ?? 0))[0]
  if (mostElev) cards.push({
    key: 'most-elevation', label: 'Most elevation',
    stat: `+${Math.round(mostElev.elevation_gain_m!)} m`,
    sub: `${mostElev.name} · ${fmtDate(mostElev.start_time)}`,
    modal: () => ({
      title: 'All Activities — by Elevation Gain',
      subtitle: `${withElev.length} activities with elevation data`,
      rows: [...withElev].sort((a, b) => (b.elevation_gain_m ?? 0) - (a.elevation_gain_m ?? 0)),
      cols: [A_RANK, A_DATE, A_TYPE, A_NAME, A_ELEV, A_DIST, A_DUR, A_HR],
    }),
  })

  // Best aerobic TE
  const withTE = activities.filter(a => (a.aerobic_te ?? 0) > 0)
  const bestTE = [...withTE].sort((a, b) => (b.aerobic_te ?? 0) - (a.aerobic_te ?? 0))[0]
  if (bestTE) cards.push({
    key: 'best-te', label: 'Best aerobic TE',
    stat: `${bestTE.aerobic_te?.toFixed(1)} / 5.0`,
    sub: `${bestTE.name} · ${fmtDate(bestTE.start_time)}`,
    modal: () => ({
      title: 'All Activities — by Aerobic Training Effect',
      subtitle: 'Higher = more aerobic stress. Max is 5.0',
      rows: [...withTE].sort((a, b) => (b.aerobic_te ?? 0) - (a.aerobic_te ?? 0)),
      cols: [A_RANK, A_DATE, A_TYPE, A_NAME, A_TE, A_DUR, A_DIST, A_HR, A_MAXHR],
    }),
  })

  // Highest max HR
  const withMaxHR = activities.filter(a => a.max_hr)
  const topMaxHR = [...withMaxHR].sort((a, b) => (b.max_hr ?? 0) - (a.max_hr ?? 0))[0]
  if (topMaxHR) cards.push({
    key: 'max-hr', label: 'Highest max HR',
    stat: `${topMaxHR.max_hr} bpm`,
    sub: `${topMaxHR.name} · ${fmtDate(topMaxHR.start_time)}`,
    modal: () => ({
      title: 'All Activities — by Max Heart Rate',
      subtitle: `${withMaxHR.length} activities with HR data`,
      rows: [...withMaxHR].sort((a, b) => (b.max_hr ?? 0) - (a.max_hr ?? 0)),
      cols: [A_RANK, A_DATE, A_TYPE, A_NAME, A_MAXHR, A_HR, A_DUR, A_DIST, A_CAL],
    }),
  })

  // Most calories
  const withCal = activities.filter(a => a.calories)
  const mostCal = [...withCal].sort((a, b) => (b.calories ?? 0) - (a.calories ?? 0))[0]
  if (mostCal) cards.push({
    key: 'most-calories', label: 'Most calories',
    stat: `${mostCal.calories} kcal`,
    sub: `${mostCal.name} · ${fmtDate(mostCal.start_time)}`,
    modal: () => ({
      title: 'All Activities — by Calories Burned',
      subtitle: `${withCal.length} activities with calorie data`,
      rows: [...withCal].sort((a, b) => (b.calories ?? 0) - (a.calories ?? 0)),
      cols: [A_RANK, A_DATE, A_TYPE, A_NAME, A_CAL, A_DUR, A_DIST, A_HR],
    }),
  })

  // ── Daily bests ────────────────────────────────────────────

  const withSteps = daily.filter(d => (d.steps ?? 0) > 0)
  const maxSteps = [...withSteps].sort((a, b) => (b.steps ?? 0) - (a.steps ?? 0))[0]
  if (maxSteps) cards.push({
    key: 'max-steps', label: 'Most steps in a day',
    stat: (maxSteps.steps ?? 0).toLocaleString(),
    sub: fmtDate(maxSteps.date),
    modal: () => ({
      title: 'All Days — by Step Count',
      subtitle: `${withSteps.length} days with step data · top 200 shown`,
      rows: [...withSteps].sort((a, b) => (b.steps ?? 0) - (a.steps ?? 0)).slice(0, 200),
      cols: [D_RANK, D_DATE, D_STEPS, D_DIST, D_ACT, D_CAL, D_RHR, D_STRESS],
    }),
  })

  const withDailyDist = daily.filter(d => (d.distance_meters ?? 0) > 0)
  const maxDailyDist = [...withDailyDist].sort((a, b) => (b.distance_meters ?? 0) - (a.distance_meters ?? 0))[0]
  if (maxDailyDist) cards.push({
    key: 'max-daily-dist', label: 'Most distance in a day',
    stat: fmtDist(maxDailyDist.distance_meters),
    sub: fmtDate(maxDailyDist.date),
    modal: () => ({
      title: 'All Days — by Total Distance',
      subtitle: `${withDailyDist.length} days with distance data · top 200 shown`,
      rows: [...withDailyDist].sort((a, b) => (b.distance_meters ?? 0) - (a.distance_meters ?? 0)).slice(0, 200),
      cols: [D_RANK, D_DATE, D_DIST, D_STEPS, D_ACT, D_CAL, D_RHR],
    }),
  })

  const withBB = daily.filter(d => d.body_battery_high)
  const highBB = [...withBB].sort((a, b) => (b.body_battery_high ?? 0) - (a.body_battery_high ?? 0))[0]
  if (highBB) cards.push({
    key: 'high-bb', label: 'Best body battery day',
    stat: `${highBB.body_battery_high} / 100`,
    sub: fmtDate(highBB.date),
    modal: () => ({
      title: 'All Days — by Peak Body Battery',
      subtitle: `${withBB.length} days · higher = more recovered`,
      rows: [...withBB].sort((a, b) => (b.body_battery_high ?? 0) - (a.body_battery_high ?? 0)).slice(0, 200),
      cols: [D_RANK, D_DATE, D_BB, D_RHR, D_STRESS, D_STEPS, D_ACT],
    }),
  })

  const withRHR = daily.filter(d => d.resting_hr)
  const lowestRHR = [...withRHR].sort((a, b) => (a.resting_hr ?? 999) - (b.resting_hr ?? 999))[0]
  if (lowestRHR) cards.push({
    key: 'lowest-rhr', label: 'Lowest resting HR',
    stat: `${lowestRHR.resting_hr} bpm`,
    sub: fmtDate(lowestRHR.date),
    modal: () => ({
      title: 'All Days — by Resting Heart Rate (lowest first)',
      subtitle: 'Lower = more recovered / better fitness',
      rows: [...withRHR].sort((a, b) => (a.resting_hr ?? 999) - (b.resting_hr ?? 999)).slice(0, 200),
      cols: [D_RANK, D_DATE, D_RHR, D_BB, D_STRESS, D_STEPS],
    }),
  })

  // ── Render ────────────────────────────────────────────────
  const activeCard = cards.find(c => c.key === expanded)
  const modalCfg = activeCard ? activeCard.modal() : null

  return (
    <>
      <div className="bg-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-300">Personal Bests</h3>
          <span className="text-xs text-slate-500">click any card to see full list</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {cards.map(c => (
            <button
              key={c.key}
              onClick={() => setExpanded(c.key)}
              className="bg-slate-700/50 hover:bg-slate-700 rounded-lg p-3 text-left transition-colors cursor-pointer group"
            >
              <div className="text-xs text-slate-400 mb-1">{c.label}</div>
              <div className="text-lg font-semibold text-white leading-tight group-hover:text-blue-300 transition-colors">
                {c.stat}
              </div>
              <div className="text-xs text-slate-500 mt-1 truncate">{c.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {modalCfg && <Modal cfg={modalCfg} onClose={() => setExpanded(null)} />}
    </>
  )
}
