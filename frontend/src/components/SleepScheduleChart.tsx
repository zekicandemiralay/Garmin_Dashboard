import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { SleepRow } from '../types'

interface Props { data: SleepRow[] }

/**
 * Convert a UTC ISO timestamp to a local decimal hour.
 * Bedtimes after 12:00 stay as-is (e.g. 23:00 → 23.0).
 * Bedtimes before 12:00 get +24 so the axis is continuous
 * across midnight (e.g. 01:30 → 25.5).
 */
function toDecimalHour(iso: string | null, wrapMidnight = false): number | null {
  if (!iso) return null
  const d   = new Date(iso)
  const h   = d.getHours() + d.getMinutes() / 60
  if (wrapMidnight && h < 14) return h + 24
  return h
}

/** Format a decimal hour like 23.5 → "23:30", 25.5 → "01:30" */
function fmtHour(h: number): string {
  const norm = ((h % 24) + 24) % 24
  const hh   = Math.floor(norm)
  const mm   = Math.round((norm - hh) * 60)
  return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`
}

const TOOLTIP_STYLE = { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }

export default function SleepScheduleChart({ data }: Props) {
  // Build chart rows — one per night
  const chartData = data
    .map(r => {
      const bed  = toDecimalHour(r.start_time, true)  // e.g. 23.5 or 25.5
      const wake = toDecimalHour(r.end_time, false)    // e.g. 7.2

      if (bed == null || wake == null) return null

      // Wake must be numerically greater than bed for the stacked area to fill correctly.
      // Since bed is already wrapped (00:30 → 24.5), wake values like 7.2 are < bed,
      // so add 24: 7.2 → 31.2.
      const wakeAdj = wake < bed ? wake + 24 : wake

      return {
        date:      r.date.slice(5),
        bed,                                          // invisible base for stacking
        window:    +(wakeAdj - bed).toFixed(2),       // stacked fill = sleep duration
        bedLine:   bed,
        wakeLine:  wakeAdj,
        score:     r.sleep_score,
        durationH: r.duration_seconds ? +(r.duration_seconds / 3600).toFixed(1) : null,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  // Compute Y domain from actual data so it always fits.
  // With `reversed`, domain[0] (smaller) is at the TOP and domain[1] (larger) at the BOTTOM.
  const allBeds  = chartData.map(r => r.bed)
  const allWakes = chartData.map(r => r.wakeLine)
  const yMin = Math.floor(Math.min(...allBeds))
  const yMax = Math.ceil (Math.max(...allWakes))

  // One tick per hour across the whole range, formatted as HH:MM
  const yTicks = Array.from({ length: yMax - yMin + 1 }, (_, i) => yMin + i)

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-300 mb-1">Sleep Schedule Consistency</h3>
      <p className="text-xs text-slate-500 mb-4">
        Filled area = sleep window each night (bedtime → wake). Consistent schedule = uniform band height and position.
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} interval="preserveStartEnd" />
          <YAxis
            domain={[yMin, yMax]}
            reversed
            ticks={yTicks}
            tickFormatter={fmtHour}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: '#cbd5e1' }}
            formatter={(v: number, name: string) => {
              if (name === 'Bedtime') return [fmtHour(v), name]
              if (name === 'Wake time') return [fmtHour(v), name]
              return [v, name]
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />

          {/* Bedtime line */}
          <Line
            type="monotone"
            dataKey="bedLine"
            name="Bedtime"
            stroke="#818cf8"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          {/* Wake time line */}
          <Line
            type="monotone"
            dataKey="wakeLine"
            name="Wake time"
            stroke="#2dd4bf"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
