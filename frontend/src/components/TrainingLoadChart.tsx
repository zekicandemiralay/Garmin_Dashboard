import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, Scatter,
} from 'recharts'
import type { Activity } from '../types'

interface Props { data: Activity[] }

// Bucket activities by week, sum distances per type
function toWeeklyBuckets(activities: Activity[]) {
  const buckets: Record<string, { week: string; CYCLING: number; RUNNING: number; WALKING: number; OTHER: number; count: number }> = {}

  for (const a of activities) {
    const d = new Date(a.start_time)
    // Monday of week
    const day = d.getDay()
    const monday = new Date(d)
    monday.setDate(d.getDate() - ((day + 6) % 7))
    const week = monday.toISOString().slice(0, 10)

    if (!buckets[week]) buckets[week] = { week, CYCLING: 0, RUNNING: 0, WALKING: 0, OTHER: 0, count: 0 }
    const km = (a.distance_meters ?? 0) / 1000
    const type = ['CYCLING', 'RUNNING', 'WALKING'].includes(a.activity_type) ? a.activity_type as 'CYCLING' | 'RUNNING' | 'WALKING' : 'OTHER'
    buckets[week][type] += km
    buckets[week].count += 1
  }

  return Object.values(buckets).sort((a, b) => a.week.localeCompare(b.week)).map(b => ({
    ...b,
    CYCLING: +b.CYCLING.toFixed(2),
    RUNNING: +b.RUNNING.toFixed(2),
    WALKING: +b.WALKING.toFixed(2),
    OTHER:   +b.OTHER.toFixed(2),
  }))
}

export default function TrainingLoadChart({ data }: Props) {
  const chartData = toWeeklyBuckets(data)

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-300 mb-4">Weekly Distance by Activity Type</h3>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis yAxisId="km" tick={{ fontSize: 11, fill: '#94a3b8' }} unit="km" />
          <YAxis yAxisId="count" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            labelStyle={{ color: '#cbd5e1' }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
          <Bar yAxisId="km" dataKey="CYCLING" name="Cycling km" stackId="a" fill="#3b82f6" />
          <Bar yAxisId="km" dataKey="RUNNING" name="Running km" stackId="a" fill="#f97316" />
          <Bar yAxisId="km" dataKey="WALKING" name="Walking km" stackId="a" fill="#22c55e" />
          <Bar yAxisId="km" dataKey="OTHER"   name="Other km"   stackId="a" fill="#6b7280" radius={[3, 3, 0, 0]} />
          <Line yAxisId="count" type="monotone" dataKey="count" name="# Activities" stroke="#facc15" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
