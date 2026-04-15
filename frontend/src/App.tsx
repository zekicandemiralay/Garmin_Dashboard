import { useState, useEffect, useCallback } from 'react'
import { fetchDaily, fetchSleep, fetchHrv, fetchActivities, fetchSummary, fetchRange } from './api'
import type { DailyRow, SleepRow, HrvRow, Activity, Summary, DataRange } from './types'

import SummaryCards from './components/SummaryCards'
import BodyBatteryChart from './components/BodyBatteryChart'
import BodyBatteryDeltaChart from './components/BodyBatteryDeltaChart'
import SleepChart from './components/SleepChart'
import SleepDebtChart from './components/SleepDebtChart'
import SleepScheduleChart from './components/SleepScheduleChart'
import SleepRespirationChart from './components/SleepRespirationChart'
import StepsChart from './components/StepsChart'
import StepsRollingChart from './components/StepsRollingChart'
import HeartRateChart from './components/HeartRateChart'
import RollingHRChart from './components/RollingHRChart'
import DailyHRRangeChart from './components/DailyHRRangeChart'
import HrvChart from './components/HrvChart'
import CaloriesChart from './components/CaloriesChart'
import ActiveTimeChart from './components/ActiveTimeChart'
import FloorsChart from './components/FloorsChart'
import TrainingLoadChart from './components/TrainingLoadChart'
import ActivityHeatmap from './components/ActivityHeatmap'
import ActivitiesTable from './components/ActivitiesTable'
import ActivityMap from './components/ActivityMap'
import ActivityPaceChart from './components/ActivityPaceChart'
import PersonalBestsTable from './components/PersonalBestsTable'

// ─── Range ────────────────────────────────────────────────────────────────────

const PRESET_RANGES = [
  { label: '7d',  days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '6m',  days: 180 },
  { label: '1y',  days: 365 },
  { label: 'All', days: null },
] as const

type RangeLabel = typeof PRESET_RANGES[number]['label']

function today(): string {
  return new Date().toISOString().slice(0, 10)
}
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = ['Overview', 'Health', 'Sleep', 'Activity'] as const
type Tab = typeof TABS[number]

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-slate-600 border-t-blue-400 rounded-full animate-spin" />
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState<Tab>('Overview')
  const [rangeLabel, setRangeLabel] = useState<RangeLabel | null>('30d')
  const [customStart, setCustomStart] = useState<string | null>(null)
  const [customEnd,   setCustomEnd]   = useState<string | null>(null)
  const [mapHighlightId, setMapHighlightId] = useState<number | null>(null)
  const [dataRange, setDataRange] = useState<DataRange>({ earliest: null, latest: null })

  const [daily, setDaily] = useState<DailyRow[]>([])
  const [sleep, setSleep] = useState<SleepRow[]>([])
  const [hrv, setHrv]   = useState<HrvRow[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch the DB bounds once on mount
  useEffect(() => {
    fetchRange().then(setDataRange).catch(() => {})
  }, [])

  // Derive start/end — custom dates take priority over presets
  const { start, end } = (() => {
    if (customStart && customEnd) return { start: customStart, end: customEnd }
    const e = today()
    if (rangeLabel === 'All') return { start: dataRange.earliest ?? daysAgo(365), end: e }
    const preset = PRESET_RANGES.find(r => r.label === rangeLabel)!
    return { start: daysAgo(preset.days as number), end: e }
  })()

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      fetchDaily(start, end),
      fetchSleep(start, end),
      fetchHrv(start, end),
      fetchActivities(start, end),
      fetchSummary(),
    ])
      .then(([d, s, h, a, sum]) => {
        setDaily(d)
        setSleep(s)
        setHrv(h)
        setActivities(a)
        setSummary(sum)
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [start, end])

  useEffect(() => { load() }, [load])

  const dateLabel = `${start} → ${end}  (${daily.length} days)`

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 backdrop-blur px-6 py-3 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3 mr-auto">
          <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-semibold text-white leading-tight">Garmin Dashboard</h1>
            <p className="text-xs text-slate-500 leading-tight">{dateLabel}</p>
          </div>
        </div>

        {/* Range selector */}
        <div className="flex bg-slate-800 rounded-lg p-1 gap-1">
          {PRESET_RANGES.map(({ label }) => (
            <button
              key={label}
              onClick={() => { setRangeLabel(label); setCustomStart(null); setCustomEnd(null) }}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                rangeLabel === label ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
          {customStart && customEnd && (
            <div className="px-3 py-1 rounded-md text-sm font-medium bg-blue-600 text-white">
              {customStart.slice(5)} – {customEnd.slice(5)}
            </div>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-slate-800 px-6">
        <div className="flex gap-1">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <main className="px-6 py-6 max-w-7xl mx-auto space-y-5">
        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-xl px-4 py-3 text-sm">
            Failed to load data: {error}
          </div>
        )}

        {loading ? <Spinner /> : (
          <>
            {/* ── Overview ─────────────────────────────────────────────── */}
            {tab === 'Overview' && (
              <>
                {summary && <SummaryCards summary={summary} />}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <BodyBatteryChart data={daily} />
                  <SleepChart data={sleep} />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <StepsRollingChart data={daily} />
                  <RollingHRChart data={daily} />
                </div>
                {activities.length > 0 && dataRange.earliest && (
                  <ActivityHeatmap
                    data={activities}
                    earliest={dataRange.earliest}
                    latest={dataRange.latest ?? today()}
                  />
                )}
              </>
            )}

            {/* ── Health ───────────────────────────────────────────────── */}
            {tab === 'Health' && (
              <>
                <DailyHRRangeChart data={daily} />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <RollingHRChart data={daily} />
                  <HrvChart data={hrv} />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <BodyBatteryChart data={daily} />
                  <BodyBatteryDeltaChart data={daily} />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <CaloriesChart data={daily} />
                  <ActiveTimeChart data={daily} />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <StepsRollingChart data={daily} />
                  <FloorsChart data={daily} />
                </div>
              </>
            )}

            {/* ── Sleep ────────────────────────────────────────────────── */}
            {tab === 'Sleep' && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <SleepChart data={sleep} />
                  <SleepDebtChart data={sleep} />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <SleepRespirationChart data={sleep} />
                  <SleepScheduleChart data={sleep} />
                </div>
              </>
            )}

            {/* ── Activity ─────────────────────────────────────────────── */}
            {tab === 'Activity' && (
              <>
                <ActivityMap
                  start={start}
                  end={end}
                  highlightedId={mapHighlightId}
                  onRangeChange={(s, e) => { setCustomStart(s); setCustomEnd(e); setRangeLabel(null) }}
                />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <ActivityPaceChart data={activities} />
                  <PersonalBestsTable
                    activities={activities}
                    daily={daily}
                    onSelectActivity={id => { setMapHighlightId(id); setTab('Activity') }}
                  />
                </div>
                <TrainingLoadChart data={activities} />
                {activities.length > 0 && dataRange.earliest && (
                  <ActivityHeatmap
                    data={activities}
                    earliest={dataRange.earliest}
                    latest={dataRange.latest ?? today()}
                  />
                )}
                <ActivitiesTable data={activities} />
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}
