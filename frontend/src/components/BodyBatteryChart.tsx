import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { DailyRow } from '../types'

interface Props { data: DailyRow[] }

const fmt = (d: string) => d.slice(5) // "MM-DD"

export default function BodyBatteryChart({ data }: Props) {
  const chartData = data.map(r => ({
    date: fmt(r.date),
    high: r.body_battery_high,
    low: r.body_battery_low,
    stress: r.stress_avg,
  }))

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-300 mb-4">Body Battery & Stress</h3>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="bbHigh" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="bbLow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            labelStyle={{ color: '#cbd5e1' }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
          <Area type="monotone" dataKey="high" name="BB High" stroke="#22c55e" fill="url(#bbHigh)" strokeWidth={2} dot={false} />
          <Area type="monotone" dataKey="low"  name="BB Low"  stroke="#f59e0b" fill="url(#bbLow)"  strokeWidth={2} dot={false} />
          <Area type="monotone" dataKey="stress" name="Stress" stroke="#f87171" fill="none" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
