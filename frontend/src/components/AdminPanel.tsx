import { useState, useEffect } from 'react'
import { fetchAdminUsers, createAdminUser, deleteAdminUser } from '../api'
import type { AdminUser } from '../types'

interface Props {
  onBack: () => void
}

export default function AdminPanel({ onBack }: Props) {
  const [users, setUsers]           = useState<AdminUser[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)

  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newIsAdmin, setNewIsAdmin]   = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating]       = useState(false)

  const [deletingId, setDeletingId] = useState<number | null>(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      setUsers(await fetchAdminUsers())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newUsername.trim() || !newPassword) return
    if (newPassword.length < 8) { setCreateError('Password must be at least 8 characters'); return }
    setCreating(true); setCreateError(null)
    try {
      await createAdminUser(newUsername.trim(), newPassword, newIsAdmin)
      setNewUsername(''); setNewPassword(''); setNewIsAdmin(false)
      await load()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: number, username: string) {
    if (!window.confirm(`Delete user "${username}"? This will permanently remove all their data.`)) return
    setDeletingId(id)
    try {
      await deleteAdminUser(id)
      setUsers(prev => prev.filter(u => u.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user')
    } finally {
      setDeletingId(null)
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-white">User Management</h1>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700/50 text-red-300 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* User list */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-slate-200">Users</h2>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-slate-600 border-t-blue-400 rounded-full animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-slate-500 px-5 py-8 text-center">No users found.</p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {users.map(u => (
                <li key={u.id} className="flex items-center justify-between px-5 py-3 gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white font-medium truncate">{u.username}</span>
                      {u.is_admin && (
                        <span className="text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded px-1.5 py-0.5">
                          admin
                        </span>
                      )}
                      {u.has_garmin && (
                        <span className="text-xs bg-green-500/20 text-green-300 border border-green-500/30 rounded px-1.5 py-0.5">
                          garmin
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {u.activity_count} activities · joined {formatDate(u.created_at)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(u.id, u.username)}
                    disabled={deletingId === u.id}
                    className="shrink-0 text-xs text-red-400 hover:text-red-300 disabled:opacity-40 px-2 py-1 rounded hover:bg-red-900/20 transition-colors"
                  >
                    {deletingId === u.id ? 'Deleting…' : 'Delete'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Create user */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Create User</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            {createError && (
              <div className="bg-red-900/30 border border-red-700/50 text-red-300 rounded-lg px-3 py-2 text-sm">
                {createError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Username</label>
                <input
                  type="text"
                  autoComplete="off"
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  placeholder="username"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Password</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  placeholder="min 8 chars"
                  required
                />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newIsAdmin}
                onChange={e => setNewIsAdmin(e.target.checked)}
                className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-0"
              />
              <span className="text-sm text-slate-300">Admin user</span>
            </label>
            <button
              type="submit"
              disabled={creating}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-lg py-2 text-sm transition-colors"
            >
              {creating ? 'Creating…' : 'Create user'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
