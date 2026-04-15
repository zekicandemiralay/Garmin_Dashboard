import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { DailyRow } from '../types'
import { rollingMean, rollingStd } from '../stats'

interface Props { data: DailyRow[] }

const fmt = (d: string) => d.slice(5)

export default function RollingHRChart({ data }: Props) {
  const hrs  = data.map(r => r.resting_hr)
  const mean = rollingMean(hrs, 7)
  const std  = rollingStd(hrs, 7, mean)

  const chartData = data.map((r, i) => {
    const m = mean[i]
    const s = std[i]
    return {
      date:      fmt(r.date),
      hr:        r.resting_hr,
      mean7:     m != null ? +m.toFixed(1) : null,
      // band: stacked area trick — bandMin then bandWidth on top
      bandMin:   m != null && s != null ? +(m - s).toFixed(1) : null,
      bandWidth: m != null && s != null ? +(2 * s).toFixed(1) : null,
    }
  })

  const TOOLTIP_STYLE = { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-300 mb-1">Resting HR — Rolling 7-day Mean ± 1σ</h3>
      <p className="text-xs text-slate-500 mb-4">Shaded band = mean ± 1 standard deviation. Narrower band = more consistent HR.</p>
      <ResponsiveContainer width="100%" height={230}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="hrBand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#f87171" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#f87171" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11, fill: '#94a3b8' }} unit=" bpm" />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: '#cbd5e1' }}
            formatter={(v: number, name: string) => {
              if (name === 'bandMin' || name === 'bandWidth') return [null, null]
              return [`${v} bpm`, name]
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: '#94a3b8' }}
            formatter={(v) => v === 'bandMin' || v === 'bandWidth' ? null : v}
          />
          {/* ±1σ band via stacked areas */}
          <Area type="monotone" dataKey="bandMin"   stackId="band" stroke="none" fill="transparent"       legendType="none" />
          <Area type="monotone" dataKey="bandWidth" stackId="band" stroke="none" fill="url(#hrBand)"      name="±1σ band"   legendType="square" />
          {/* Raw daily values */}
          <Line type="monotone" dataKey="hr"    name="Resting HR"   stroke="#f87171" strokeWidth={1} dot={false} strokeOpacity={0.5} connectNulls />
          {/* 7-day rolling mean */}
          <Line type="monotone" dataKey="mean7" name="7-day avg"    stroke="#fb923c" strokeWidth={2.5} dot={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
