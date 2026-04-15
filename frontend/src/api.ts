import type { DailyRow, SleepRow, HrvRow, Activity, MapActivity, Summary, DataRange } from './types'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

export function fetchDaily(start: string, end: string): Promise<DailyRow[]> {
  return get(`/api/daily?start=${start}&end=${end}`)
}

export function fetchSleep(start: string, end: string): Promise<SleepRow[]> {
  return get(`/api/sleep?start=${start}&end=${end}`)
}

export function fetchHrv(start: string, end: string): Promise<HrvRow[]> {
  return get(`/api/hrv?start=${start}&end=${end}`)
}

export function fetchActivities(start: string, end: string): Promise<Activity[]> {
  return get(`/api/activities?start=${start}&end=${end}`)
}

export function fetchSummary(): Promise<Summary> {
  return get('/api/summary')
}

export function fetchRange(): Promise<DataRange> {
  return get('/api/range')
}

export function fetchMapActivities(start: string, end: string): Promise<MapActivity[]> {
  return get(`/api/activities/map?start=${start}&end=${end}`)
}
