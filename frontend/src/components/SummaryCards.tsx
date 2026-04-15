import type { Summary } from '../types'

interface Props { summary: Summary }

interface CardProps {
  label: string
  value: string | number | null
  unit?: string
  color?: string
  sub?: string
}

function Card({ label, value, unit, color = 'text-white', sub }: CardProps) {
  return (
    <div className="bg-slate-800 rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs text-slate-400 uppercase tracking-wider">{label}</span>
      <span className={`text-2xl font-bold ${color}`}>
        {value ?? '—'}
        {value != null && unit && <span className="text-sm font-normal text-slate-400 ml-1">{unit}</span>}
      </span>
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
    </div>
  )
}

function scoreColor(score: number | null): string {
  if (score == null) return 'text-slate-400'
  if (score >= 80) return 'text-green-400'
  if (score >= 60) return 'text-yellow-400'
  return 'text-red-400'
}

function bbColor(val: number | null): string {
  if (val == null) return 'text-slate-400'
  if (val >= 75) return 'text-green-400'
  if (val >= 50) return 'text-yellow-400'
  return 'text-red-400'
}

export default function SummaryCards({ summary }: Props) {
  const d = summary.period_7d.daily
  const s = summary.period_7d.sleep

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <Card
        label="Avg Steps"
        value={d.avg_steps?.toLocaleString() ?? null}
        sub={`7-day avg`}
        color="text-blue-400"
      />
      <Card
        label="Resting HR"
        value={d.avg_resting_hr}
        unit="bpm"
        color="text-rose-400"
      />
      <Card
        label="Body Battery"
        value={d.avg_bb_high != null ? `${d.avg_bb_low}–${d.avg_bb_high}` : null}
        color={bbColor(d.avg_bb_high)}
        sub="low–high range"
      />
      <Card
        label="Stress"
        value={d.avg_stress}
        unit="/100"
        color={d.avg_stress != null && d.avg_stress < 30 ? 'text-green-400' : 'text-yellow-400'}
      />
      <Card
        label="Sleep Score"
        value={s.avg_sleep_score}
        unit="/100"
        color={scoreColor(s.avg_sleep_score)}
        sub={s.avg_sleep_hours != null ? `${s.avg_sleep_hours}h avg` : undefined}
      />
      <Card
        label="SpO2"
        value={d.avg_spo2}
        unit="%"
        color={d.avg_spo2 != null && d.avg_spo2 >= 95 ? 'text-green-400' : 'text-yellow-400'}
      />
    </div>
  )
}
