import {
  ComposedChart, Bar, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import type { DailyRow } from '../types'
import { rollingMean, rollingStd, linearRegression } from '../stats'

interface Props { data: DailyRow[] }

const fmt = (d: string) => d.slice(5)

export default function StepsRollingChart({ data }: Props) {
  const steps = data.map(r => r.steps)
  const mean7 = rollingMean(steps, 7)
  const std7  = rollingStd(steps, 7, mean7)

  // Linear trend line
  const xs    = data.map((_, i) => i)
  const reg   = linearRegression(xs, steps)
  const trend = xs.map(x => +(reg.intercept + reg.slope * x).toFixed(0))
  const trendDir = reg.slope > 5 ? '↑ improving' : reg.slope < -5 ? '↓ declining' : '→ stable'

  const goal = data.find(r => r.step_goal)?.step_goal ?? 7500

  const chartData = data.map((r, i) => {
    const m = mean7[i]; const s = std7[i]
    return {
      date:      fmt(r.date),
      steps:     r.steps,
      mean7:     m != null ? +m.toFixed(0) : null,
      trend:     trend[i],
      bandMin:   m != null && s != null ? Math.max(0, +(m - s).toFixed(0)) : null,
      bandWidth: m != null && s != null ? +(2 * s).toFixed(0) : null,
    }
  })

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <div className="flex items-start justify-between mb-1">
        <h3 className="text-sm font-semibold text-slate-300">Steps — Rolling 7-day Mean ± 1σ</h3>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          reg.slope > 5 ? 'bg-green-500/20 text-green-300' :
          reg.slope < -5 ? 'bg-red-500/20 text-red-300' : 'bg-slate-600/40 text-slate-300'
        }`}>
          {trendDir} (R²={reg.r2.toFixed(2)})
        </span>
      </div>
      <p className="text-xs text-slate-500 mb-4">Shaded band = ±1σ. Orange dashed line = long-term trend.</p>
      <ResponsiveContainer width="100%" height={230}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="stepsBand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            labelStyle={{ color: '#cbd5e1' }}
            formatter={(v: number, name: string) => {
              if (name === 'bandMin' || name === 'bandWidth') return [null, null]
              return [v.toLocaleString(), name]
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: '#94a3b8' }}
            formatter={v => (v === 'bandMin' || v === 'bandWidth') ? null : v}
          />
          <ReferenceLine y={goal} stroke="#64748b" strokeDasharray="4 2"
            label={{ value: 'goal', fill: '#64748b', fontSize: 10 }} />
          <Area type="monotone" dataKey="bandMin"   stackId="b" stroke="none" fill="transparent"       legendType="none" />
          <Area type="monotone" dataKey="bandWidth" stackId="b" stroke="none" fill="url(#stepsBand)"  name="±1σ band" legendType="square" />
          <Bar  dataKey="steps" name="Steps"       fill="#3b82f6" opacity={0.5} radius={[2, 2, 0, 0]} />
          <Line type="monotone" dataKey="mean7" name="7-day avg" stroke="#60a5fa" strokeWidth={2.5} dot={false} connectNulls />
          <Line type="monotone" dataKey="trend" name="Trend"     stroke="#f97316" strokeWidth={1.5} dot={false} strokeDasharray="6 3" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
