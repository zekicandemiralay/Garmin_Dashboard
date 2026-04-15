import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { DailyRow } from '../types'

interface Props { data: DailyRow[] }

const fmt = (d: string) => d.slice(5)

export default function HeartRateChart({ data }: Props) {
  const chartData = data.map(r => ({
    date:    fmt(r.date),
    resting: r.resting_hr,
    spo2:    r.spo2_avg,
  }))

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-300 mb-4">Resting HR & SpO2</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis yAxisId="hr" domain={['auto', 'auto']} tick={{ fontSize: 11, fill: '#94a3b8' }} unit=" bpm" />
          <YAxis yAxisId="spo2" orientation="right" domain={[85, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} unit="%" />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            labelStyle={{ color: '#cbd5e1' }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
          <Line yAxisId="hr"   type="monotone" dataKey="resting" name="Resting HR" stroke="#f87171" strokeWidth={2} dot={false} connectNulls />
          <Line yAxisId="spo2" type="monotone" dataKey="spo2"    name="SpO2 %" stroke="#34d399" strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
