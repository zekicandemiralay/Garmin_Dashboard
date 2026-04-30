import type { DailyRow, SleepRow, HrvRow, Activity, MapActivity, Summary, DataRange, CountryStat, TouringData, TourSummary, TourDetail } from './types'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

async function del(path: string): Promise<void> {
  const res = await fetch(path, { method: 'DELETE' })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
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

export function fetchCountryStats(start: string, end: string): Promise<CountryStat[]> {
  return get(`/api/activities/countries?start=${start}&end=${end}`)
}

export function fetchTouringData(start: string, end: string): Promise<TouringData> {
  return get(`/api/touring?start=${start}&end=${end}`)
}

export function fetchTours(): Promise<TourSummary[]> {
  return get('/api/tours')
}

export function createTour(name: string, description: string | null, activity_ids: number[]): Promise<{ id: number }> {
  return post('/api/tours', { name, description, activity_ids })
}

export function fetchTourDetail(id: number): Promise<TourDetail> {
  return get(`/api/tours/${id}`)
}

export function updateTour(id: number, data: { name: string; description: string | null }): Promise<{ ok: boolean }> {
  return put(`/api/tours/${id}`, data)
}

export function deleteTour(id: number): Promise<void> {
  return del(`/api/tours/${id}`)
}
