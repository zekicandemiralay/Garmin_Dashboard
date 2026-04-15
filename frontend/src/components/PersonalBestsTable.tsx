import type { Activity } from '../types'

function fmtPace(v: number) {
  return `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')} /km`
}
function fmtDist(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`
}
function fmtDur(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

interface Best { label: string; stat: string; detail: string; activity: string }

interface Props { data: Activity[] }

export default function PersonalBestsTable({ data }: Props) {
  if (data.length === 0) return null

  const bests: Best[] = []

  const runs = data.filter(a => a.activity_type === 'RUNNING' && a.distance_meters)
  const rides = data.filter(a => (a.activity_type === 'CYCLING' || a.activity_type === 'MOUNTAIN_BIKING') && a.distance_meters)

  const longestRun = runs.sort((a, b) => (b.distance_meters ?? 0) - (a.distance_meters ?? 0))[0]
  if (longestRun) bests.push({ label: 'Longest run', stat: fmtDist(longestRun.distance_meters!), detail: fmtDate(longestRun.start_time), activity: longestRun.name })

  const fastestPace = runs.filter(a => (a.distance_meters ?? 0) > 2000 && a.avg_pace_sec_per_km)
    .sort((a, b) => (a.avg_pace_sec_per_km ?? 999) - (b.avg_pace_sec_per_km ?? 999))[0]
  if (fastestPace) bests.push({ label: 'Fastest run pace', stat: fmtPace(fastestPace.avg_pace_sec_per_km!), detail: fmtDate(fastestPace.start_time), activity: fastestPace.name })

  const longestRide = rides.sort((a, b) => (b.distance_meters ?? 0) - (a.distance_meters ?? 0))[0]
  if (longestRide) bests.push({ label: 'Longest ride', stat: fmtDist(longestRide.distance_meters!), detail: fmtDate(longestRide.start_time), activity: longestRide.name })

  const longestActivity = data.filter(a => a.duration_seconds).sort((a, b) => (b.duration_seconds ?? 0) - (a.duration_seconds ?? 0))[0]
  if (longestActivity) bests.push({ label: 'Longest activity', stat: fmtDur(longestActivity.duration_seconds!), detail: fmtDate(longestActivity.start_time), activity: longestActivity.name })

  const highestTE = data.filter(a => a.aerobic_te).sort((a, b) => (b.aerobic_te ?? 0) - (a.aerobic_te ?? 0))[0]
  if (highestTE) bests.push({ label: 'Best aerobic TE', stat: `${highestTE.aerobic_te?.toFixed(1)} / 5.0`, detail: fmtDate(highestTE.start_time), activity: highestTE.name })

  const maxHR = data.filter(a => a.max_hr).sort((a, b) => (b.max_hr ?? 0) - (a.max_hr ?? 0))[0]
  if (maxHR) bests.push({ label: 'Highest max HR', stat: `${maxHR.max_hr} bpm`, detail: fmtDate(maxHR.start_time), activity: maxHR.name })

  const mostCal = data.filter(a => a.calories).sort((a, b) => (b.calories ?? 0) - (a.calories ?? 0))[0]
  if (mostCal) bests.push({ label: 'Most calories', stat: `${mostCal.calories} kcal`, detail: fmtDate(mostCal.start_time), activity: mostCal.name })

  const biggestElev = data.filter(a => a.elevation_gain_m).sort((a, b) => (b.elevation_gain_m ?? 0) - (a.elevation_gain_m ?? 0))[0]
  if (biggestElev) bests.push({ label: 'Most elevation', stat: `+${Math.round(biggestElev.elevation_gain_m!)} m`, detail: fmtDate(biggestElev.start_time), activity: biggestElev.name })

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-300 mb-4">Personal Bests</h3>
      <div className="grid grid-cols-2 gap-3">
        {bests.map(b => (
          <div key={b.label} className="bg-slate-700/50 rounded-lg p-3">
            <div className="text-xs text-slate-400 mb-1">{b.label}</div>
            <div className="text-lg font-semibold text-white leading-tight">{b.stat}</div>
            <div className="text-xs text-slate-500 mt-1 truncate">{b.activity}</div>
            <div className="text-xs text-slate-600">{b.detail}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
