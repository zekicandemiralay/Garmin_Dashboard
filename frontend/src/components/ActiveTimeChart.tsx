import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { DailyRow } from '../types'

interface Props { data: DailyRow[] }

const fmt = (d: string) => d.slice(5)
const toHours = (s: number | null) => s != null ? +(s / 3600).toFixed(2) : null

export default function ActiveTimeChart({ data }: Props) {
  const chartData = data.map(r => ({
    date:      fmt(r.date),
    active:    toHours(r.active_time_seconds),
    sedentary: toHours(r.sedentary_seconds),
  }))

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-300 mb-4">Active vs Sedentary Time</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} unit="h" />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            labelStyle={{ color: '#cbd5e1' }}
            formatter={(v: number) => [`${v}h`, undefined]}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
          <Bar dataKey="active"    name="Active (h)"    stackId="a" fill="#22c55e" />
          <Bar dataKey="sedentary" name="Sedentary (h)" stackId="a" fill="#475569" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
