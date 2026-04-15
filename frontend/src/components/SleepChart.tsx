import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { SleepRow } from '../types'

interface Props { data: SleepRow[] }

const fmt = (d: string) => d.slice(5)
const toHours = (s: number | null) => s != null ? +(s / 3600).toFixed(2) : null
const toMin   = (s: number | null) => s != null ? Math.round(s / 60) : null

export default function SleepChart({ data }: Props) {
  const chartData = data.map(r => ({
    date:   fmt(r.date),
    deep:   toMin(r.deep_seconds),
    rem:    toMin(r.rem_seconds),
    light:  toMin(r.light_seconds),
    awake:  toMin(r.awake_seconds),
    hours:  toHours(r.duration_seconds),
    score:  r.sleep_score,
  }))

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-300 mb-4">Sleep Stages & Score</h3>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis yAxisId="min" tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis yAxisId="score" orientation="right" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            labelStyle={{ color: '#cbd5e1' }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
          <Bar yAxisId="min" dataKey="deep"  name="Deep (min)"  stackId="a" fill="#6366f1" />
          <Bar yAxisId="min" dataKey="rem"   name="REM (min)"   stackId="a" fill="#8b5cf6" />
          <Bar yAxisId="min" dataKey="light" name="Light (min)" stackId="a" fill="#475569" />
          <Bar yAxisId="min" dataKey="awake" name="Awake (min)" stackId="a" fill="#374151" />
          <Line yAxisId="score" type="monotone" dataKey="score" name="Score" stroke="#facc15" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
