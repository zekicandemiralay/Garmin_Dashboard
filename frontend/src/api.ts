import type { DailyRow, SleepRow, HrvRow, Activity, MapActivity, Summary, DataRange, CountryStat, TouringData, TourSummary, TourDetail, User, AdminUser } from './types'

// ─── Token storage ────────────────────────────────────────────────────────────

export function getToken(): string | null {
  return localStorage.getItem('token')
}

export function setToken(token: string): void {
  localStorage.setItem('token', token)
}

export function clearToken(): void {
  localStorage.removeItem('token')
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: authHeaders() })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

async function post<T>(path: string, body: unknown, auth = true): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth ? authHeaders() : {}) },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error((detail as { detail?: string })?.detail ?? `${res.status} ${res.statusText}`)
  }
  return res.json()
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error((detail as { detail?: string })?.detail ?? `${res.status} ${res.statusText}`)
  }
  return res.json()
}

async function del(path: string): Promise<void> {
  const res = await fetch(path, { method: 'DELETE', headers: authHeaders() })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export function login(username: string, password: string): Promise<{ token: string; is_admin: boolean }> {
  return post('/auth/login', { username, password }, false)
}

export function fetchMe(): Promise<User> {
  return get('/auth/me')
}

export function changePassword(current_password: string, new_password: string): Promise<{ ok: boolean }> {
  return put('/auth/me/password', { current_password, new_password })
}

export function setGarminCredentials(email: string, password: string): Promise<{ ok: boolean }> {
  return put('/auth/me/garmin', { email, password })
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export function fetchAdminUsers(): Promise<AdminUser[]> {
  return get('/api/admin/users')
}

export function createAdminUser(username: string, password: string, is_admin: boolean): Promise<{ id: number }> {
  return post('/api/admin/users', { username, password, is_admin })
}

export function deleteAdminUser(id: number): Promise<void> {
  return del(`/api/admin/users/${id}`)
}

// ─── Data ─────────────────────────────────────────────────────────────────────

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
