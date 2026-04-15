import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { DailyRow } from '../types'
import { rollingMean } from '../stats'

interface Props { data: DailyRow[] }

const fmt = (d: string) => d.slice(5)

export default function BodyBatteryDeltaChart({ data }: Props) {
  const deltas = data.map(r =>
    r.body_battery_high != null && r.body_battery_low != null
      ? r.body_battery_high - r.body_battery_low
      : null
  )
  const mean7 = rollingMean(deltas, 7)

  const chartData = data.map((r, i) => ({
    date:   fmt(r.date),
    delta:  deltas[i],
    avg7:   mean7[i] != null ? +mean7[i]!.toFixed(1) : null,
    stress: r.stress_avg,
  }))

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-300 mb-1">Body Battery Recovery (High − Low)</h3>
      <p className="text-xs text-slate-500 mb-4">How many points you recharged each day. Higher = better recovery. Overlaid with daily stress.</p>
      <ResponsiveContainer width="100%" height={230}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis yAxisId="delta"  domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis yAxisId="stress" orientation="right" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            labelStyle={{ color: '#cbd5e1' }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
          <Bar  yAxisId="delta"  dataKey="delta"  name="Recovery Δ"   fill="#22c55e" radius={[3, 3, 0, 0]} opacity={0.7} />
          <Line yAxisId="delta"  type="monotone" dataKey="avg7"   name="7-day avg Δ" stroke="#4ade80" strokeWidth={2.5} dot={false} connectNulls />
          <Line yAxisId="stress" type="monotone" dataKey="stress" name="Stress"      stroke="#f87171" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
