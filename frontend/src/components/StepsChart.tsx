import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import type { DailyRow } from '../types'

interface Props { data: DailyRow[] }

const fmt = (d: string) => d.slice(5)

export default function StepsChart({ data }: Props) {
  const goal = data.find(r => r.step_goal)?.step_goal ?? 7500

  const chartData = data.map(r => ({
    date:     fmt(r.date),
    steps:    r.steps,
    distance: r.distance_meters != null ? +(r.distance_meters / 1000).toFixed(2) : null,
  }))

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-300 mb-4">Steps & Distance</h3>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis yAxisId="steps" tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis yAxisId="km" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} unit="km" />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            labelStyle={{ color: '#cbd5e1' }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
          <ReferenceLine yAxisId="steps" y={goal} stroke="#64748b" strokeDasharray="4 2" label={{ value: 'goal', fill: '#64748b', fontSize: 10 }} />
          <Bar yAxisId="steps" dataKey="steps" name="Steps" fill="#3b82f6" radius={[3, 3, 0, 0]} />
          <Line yAxisId="km" type="monotone" dataKey="distance" name="Distance (km)" stroke="#38bdf8" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
