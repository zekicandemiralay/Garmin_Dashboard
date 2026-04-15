import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import type { SleepRow } from '../types'
import { rollingMean } from '../stats'
import { cumulativeSum } from '../stats'

interface Props { data: SleepRow[]; targetHours?: number }

const TARGET_DEFAULT = 8
const fmt = (d: string) => d.slice(5)

export default function SleepDebtChart({ data, targetHours = TARGET_DEFAULT }: Props) {
  const targetSec = targetHours * 3600
  const hours     = data.map(r => r.duration_seconds != null ? +(r.duration_seconds / 3600).toFixed(2) : null)
  const mean7     = rollingMean(hours, 7)
  // daily deficit in minutes (negative = surplus)
  const dailyDebt = data.map(r =>
    r.duration_seconds != null ? +((targetSec - r.duration_seconds) / 60).toFixed(0) : 0
  )
  const cumDebt = cumulativeSum(dailyDebt).map(v => +v.toFixed(0))

  const chartData = data.map((r, i) => ({
    date:    fmt(r.date),
    hours:   hours[i],
    mean7:   mean7[i] != null ? +mean7[i]!.toFixed(2) : null,
    cumDebt: cumDebt[i],
  }))

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-300 mb-1">Sleep Duration & Cumulative Debt</h3>
      <p className="text-xs text-slate-500 mb-4">
        Target: {targetHours}h/night. Cumulative debt = running total of minutes under target (rising = building debt).
      </p>
      <ResponsiveContainer width="100%" height={230}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis yAxisId="hours" domain={[0, 12]}  tick={{ fontSize: 11, fill: '#94a3b8' }} unit="h" />
          <YAxis yAxisId="debt"  orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} unit="m" />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            labelStyle={{ color: '#cbd5e1' }}
            formatter={(v: number, name: string) => [
              name === 'Cum. debt (min)' ? `${v} min` : name.includes('avg') ? `${v}h` : `${v}h`,
              name,
            ]}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
          <ReferenceLine yAxisId="hours" y={targetHours} stroke="#64748b" strokeDasharray="4 2"
            label={{ value: `${targetHours}h target`, fill: '#64748b', fontSize: 10 }} />
          <Bar  yAxisId="hours" dataKey="hours" name="Sleep (h)"    fill="#6366f1" radius={[3, 3, 0, 0]} opacity={0.7} />
          <Line yAxisId="hours" type="monotone" dataKey="mean7"   name="7-day avg" stroke="#a5b4fc" strokeWidth={2.5} dot={false} connectNulls />
          <Line yAxisId="debt"  type="monotone" dataKey="cumDebt" name="Cum. debt (min)" stroke="#f87171" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
