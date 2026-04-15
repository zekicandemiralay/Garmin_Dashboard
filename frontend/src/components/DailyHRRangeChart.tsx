import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { DailyRow } from '../types'
import { rollingMean } from '../stats'

interface Props { data: DailyRow[] }

const fmt = (d: string) => d.slice(5)

const TOOLTIP_STYLE = { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }

export default function DailyHRRangeChart({ data }: Props) {
  const maxHrs = data.map(r => r.max_hr_day)
  const mean7  = rollingMean(maxHrs, 7)

  const allHR = data.flatMap(r => [r.min_hr_day, r.resting_hr, r.max_hr_day]).filter((v): v is number => v != null)
  const yMin = allHR.length ? Math.floor(Math.min(...allHR) / 5) * 5 - 5 : 40
  const yMax = allHR.length ? Math.ceil(Math.max(...allHR)  / 5) * 5 + 5 : 200

  const chartData = data.map((r, i) => {
    const min     = r.min_hr_day
    const resting = r.resting_hr
    const max     = r.max_hr_day
    return {
      date:    fmt(r.date),
      // Native Recharts range area: [lower, upper] tuple — no stacking needed
      hrRange: min != null && max != null ? [min, max] : null,
      resting, max, min,
      maxAvg7: mean7[i] != null ? +mean7[i]!.toFixed(1) : null,
    }
  })

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-300 mb-1">Daily Heart Rate Range</h3>
      <p className="text-xs text-slate-500 mb-4">
        Shaded area = full daily range (min → max). Lines: resting HR (red), daily max 7-day avg (orange).
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="hrRange" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#f87171" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#f87171" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis domain={[yMin, yMax]} tick={{ fontSize: 11, fill: '#94a3b8' }} unit=" bpm" />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: '#cbd5e1' }}
            formatter={(v: unknown, name: string) => {
              if (name === 'hrRange') return [null, null]
              return [`${v} bpm`, name]
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: '#94a3b8' }}
            formatter={v => v === 'hrRange' ? null : v}
          />
          {/* Filled HR range band via native range area [min, max] */}
          <Area type="monotone" dataKey="hrRange" stroke="none" fill="url(#hrRange)" name="Daily range" legendType="square" />
          {/* Min HR line */}
          <Line type="monotone" dataKey="min"     name="Min HR"         stroke="#94a3b8" strokeWidth={1}   dot={false} connectNulls strokeOpacity={0.6} />
          {/* Resting HR */}
          <Line type="monotone" dataKey="resting" name="Resting HR"     stroke="#f87171" strokeWidth={2}   dot={false} connectNulls />
          {/* Max HR */}
          <Line type="monotone" dataKey="max"     name="Max HR"         stroke="#fb923c" strokeWidth={1}   dot={false} connectNulls strokeOpacity={0.7} />
          {/* 7-day rolling avg of max */}
          <Line type="monotone" dataKey="maxAvg7" name="Max HR 7d avg"  stroke="#fbbf24" strokeWidth={2}   dot={false} connectNulls strokeDasharray="5 3" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
