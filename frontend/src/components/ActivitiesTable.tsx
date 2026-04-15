import type { Activity } from '../types'

interface Props { data: Activity[] }

const ACTIVITY_COLORS: Record<string, string> = {
  RUNNING:  'bg-orange-500/20 text-orange-300',
  CYCLING:  'bg-blue-500/20 text-blue-300',
  WALKING:  'bg-green-500/20 text-green-300',
  SWIMMING: 'bg-cyan-500/20 text-cyan-300',
  STRENGTH: 'bg-purple-500/20 text-purple-300',
}
const defaultBadge = 'bg-slate-600/40 text-slate-300'

function formatPace(secPerKm: number | null, type: string): string {
  if (!secPerKm) return '—'
  if (type === 'CYCLING') {
    const kmh = 3600 / secPerKm
    return `${kmh.toFixed(1)} km/h`
  }
  const min = Math.floor(secPerKm / 60)
  const sec = Math.round(secPerKm % 60)
  return `${min}:${sec.toString().padStart(2, '0')} /km`
}

function formatDuration(s: number | null): string {
  if (!s) return '—'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function ActivitiesTable({ data }: Props) {
  const sorted = [...data].sort((a, b) =>
    new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
  )

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-300 mb-4">Activities</h3>
      {sorted.length === 0 ? (
        <p className="text-slate-500 text-sm">No activities in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-700">
                <th className="pb-2 pr-4 font-medium">Date</th>
                <th className="pb-2 pr-4 font-medium">Type</th>
                <th className="pb-2 pr-4 font-medium">Name</th>
                <th className="pb-2 pr-4 font-medium text-right">Duration</th>
                <th className="pb-2 pr-4 font-medium text-right">Distance</th>
                <th className="pb-2 pr-4 font-medium text-right">Pace/Speed</th>
                <th className="pb-2 pr-4 font-medium text-right">Avg HR</th>
                <th className="pb-2 font-medium text-right">Cal</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(a => {
                const badge = ACTIVITY_COLORS[a.activity_type] ?? defaultBadge
                return (
                  <tr key={a.activity_id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                    <td className="py-2 pr-4 text-slate-400">
                      {new Date(a.start_time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge}`}>
                        {a.activity_type}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-slate-300">{a.name}</td>
                    <td className="py-2 pr-4 text-right text-slate-300">{formatDuration(a.duration_seconds)}</td>
                    <td className="py-2 pr-4 text-right text-slate-300">
                      {a.distance_meters ? `${(a.distance_meters / 1000).toFixed(2)} km` : '—'}
                    </td>
                    <td className="py-2 pr-4 text-right text-slate-300">
                      {formatPace(a.avg_pace_sec_per_km, a.activity_type)}
                    </td>
                    <td className="py-2 pr-4 text-right text-rose-400">{a.avg_hr ?? '—'}</td>
                    <td className="py-2 text-right text-slate-400">{a.calories ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
