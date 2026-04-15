import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { SleepRow } from '../types'

interface Props { data: SleepRow[] }

const fmt = (d: string) => d.slice(5)

export default function SleepRespirationChart({ data }: Props) {
  const chartData = data.map(r => ({
    date:  fmt(r.date),
    resp:  r.avg_respiration,
    spo2:  r.avg_spo2,
    score: r.sleep_score,
  }))

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-300 mb-4">Sleep SpO2, Respiration & Score</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis yAxisId="pct" domain={[85, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis yAxisId="bpm" orientation="right" domain={[8, 20]} tick={{ fontSize: 11, fill: '#94a3b8' }} unit=" bpm" />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            labelStyle={{ color: '#cbd5e1' }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
          <Line yAxisId="pct" type="monotone" dataKey="spo2"  name="Sleep SpO2 %"    stroke="#34d399" strokeWidth={2} dot={false} connectNulls />
          <Line yAxisId="pct" type="monotone" dataKey="score" name="Sleep Score"     stroke="#facc15" strokeWidth={2} dot={false} connectNulls />
          <Line yAxisId="bpm" type="monotone" dataKey="resp"  name="Respiration bpm" stroke="#818cf8" strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
