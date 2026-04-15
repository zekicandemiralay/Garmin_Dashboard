import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { DailyRow } from '../types'

interface Props { data: DailyRow[] }

const fmt = (d: string) => d.slice(5)

export default function FloorsChart({ data }: Props) {
  const chartData = data.map(r => ({
    date:      fmt(r.date),
    ascended:  r.floors_ascended,
    descended: r.floors_descended,
  }))

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-300 mb-4">Floors Climbed</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            labelStyle={{ color: '#cbd5e1' }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
          <Bar dataKey="ascended"  name="Ascended"  fill="#60a5fa" radius={[3, 3, 0, 0]} />
          <Bar dataKey="descended" name="Descended" fill="#475569" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
