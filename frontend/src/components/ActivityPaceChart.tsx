import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { Activity } from '../types'

const TOOLTIP_STYLE = { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }

function fmtPace(v: number) {
  const m = Math.floor(v / 60)
  const s = String(Math.round(v % 60)).padStart(2, '0')
  return `${m}:${s}`
}

interface Props { data: Activity[] }

export default function ActivityPaceChart({ data }: Props) {
  const runs = data
    .filter(a => a.activity_type === 'RUNNING' && a.avg_pace_sec_per_km && (a.distance_meters ?? 0) > 800)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))

  if (runs.length < 3) return null

  const paces = runs.map(r => r.avg_pace_sec_per_km!)
  const chartData = runs.map((r, i) => {
    const window = paces.slice(Math.max(0, i - 4), i + 1)
    const avg = window.reduce((s, p) => s + p, 0) / window.length
    return {
      date:  r.start_time.slice(5, 10),
      pace:  r.avg_pace_sec_per_km!,
      avg5:  +avg.toFixed(0),
      dist:  r.distance_meters,
      name:  r.name,
    }
  })

  const yMin = Math.floor(Math.min(...paces) / 30) * 30 - 30
  const yMax = Math.ceil(Math.max(...paces) / 30) * 30 + 30

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-300 mb-1">Running Pace Trend</h3>
      <p className="text-xs text-slate-500 mb-4">Each dot = one run · line = 5-run rolling average · lower = faster</p>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} interval="preserveStartEnd" />
          <YAxis
            domain={[yMin, yMax]}
            reversed
            tickFormatter={fmtPace}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            width={42}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: '#cbd5e1' }}
            formatter={(v: number, name: string) => {
              if (name === 'pace') return [`${fmtPace(v)} /km`, 'Pace']
              if (name === 'avg5') return [`${fmtPace(v)} /km`, '5-run avg']
              return [v, name]
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
          <Line
            type="monotone" dataKey="pace" name="pace"
            stroke="#2dd4bf" strokeOpacity={0} connectNulls
            dot={{ r: 3.5, fill: '#2dd4bf', fillOpacity: 0.75, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone" dataKey="avg5" name="5-run avg"
            stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
