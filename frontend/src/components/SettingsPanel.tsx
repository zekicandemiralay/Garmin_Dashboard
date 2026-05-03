import { useState } from 'react'
import { changePassword, setGarminCredentials } from '../api'

interface Props {
  username: string
  onBack: () => void
}

export default function SettingsPanel({ username, onBack }: Props) {
  const [pwCurrent, setPwCurrent]   = useState('')
  const [pwNew, setPwNew]           = useState('')
  const [pwConfirm, setPwConfirm]   = useState('')
  const [pwError, setPwError]       = useState<string | null>(null)
  const [pwSuccess, setPwSuccess]   = useState(false)
  const [pwLoading, setPwLoading]   = useState(false)

  const [gcEmail, setGcEmail]       = useState('')
  const [gcPass, setGcPass]         = useState('')
  const [gcError, setGcError]       = useState<string | null>(null)
  const [gcSuccess, setGcSuccess]   = useState(false)
  const [gcLoading, setGcLoading]   = useState(false)

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault()
    if (pwNew !== pwConfirm) { setPwError('New passwords do not match'); return }
    if (pwNew.length < 8) { setPwError('New password must be at least 8 characters'); return }
    setPwLoading(true); setPwError(null); setPwSuccess(false)
    try {
      await changePassword(pwCurrent, pwNew)
      setPwSuccess(true)
      setPwCurrent(''); setPwNew(''); setPwConfirm('')
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setPwLoading(false)
    }
  }

  async function handleGarminCredentials(e: React.FormEvent) {
    e.preventDefault()
    if (!gcEmail.trim() || !gcPass) { setGcError('Email and password are required'); return }
    setGcLoading(true); setGcError(null); setGcSuccess(false)
    try {
      await setGarminCredentials(gcEmail.trim(), gcPass)
      setGcSuccess(true)
      setGcEmail(''); setGcPass('')
    } catch (err) {
      setGcError(err instanceof Error ? err.message : 'Failed to save Garmin credentials')
    } finally {
      setGcLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-semibold text-white">Settings</h1>
            <p className="text-xs text-slate-500">{username}</p>
          </div>
        </div>

        {/* Change Password */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Change Password</h2>
          <form onSubmit={handlePasswordChange} className="space-y-3">
            {pwError && (
              <div className="bg-red-900/30 border border-red-700/50 text-red-300 rounded-lg px-3 py-2 text-sm">
                {pwError}
              </div>
            )}
            {pwSuccess && (
              <div className="bg-green-900/30 border border-green-700/50 text-green-300 rounded-lg px-3 py-2 text-sm">
                Password changed successfully.
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Current password</label>
              <input
                type="password"
                autoComplete="current-password"
                value={pwCurrent}
                onChange={e => setPwCurrent(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400">New password</label>
              <input
                type="password"
                autoComplete="new-password"
                value={pwNew}
                onChange={e => setPwNew(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Confirm new password</label>
              <input
                type="password"
                autoComplete="new-password"
                value={pwConfirm}
                onChange={e => setPwConfirm(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <button
              type="submit"
              disabled={pwLoading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-lg py-2 text-sm transition-colors"
            >
              {pwLoading ? 'Saving…' : 'Update password'}
            </button>
          </form>
        </div>

        {/* Garmin Credentials */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-slate-200 mb-1">Garmin Credentials</h2>
          <p className="text-xs text-slate-500 mb-4">
            Stored encrypted. Cannot be retrieved after saving — only used by the sync service.
          </p>
          <form onSubmit={handleGarminCredentials} className="space-y-3">
            {gcError && (
              <div className="bg-red-900/30 border border-red-700/50 text-red-300 rounded-lg px-3 py-2 text-sm">
                {gcError}
              </div>
            )}
            {gcSuccess && (
              <div className="bg-green-900/30 border border-green-700/50 text-green-300 rounded-lg px-3 py-2 text-sm">
                Garmin credentials saved. Sync will use them on next run.
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Garmin Connect email</label>
              <input
                type="email"
                autoComplete="off"
                value={gcEmail}
                onChange={e => setGcEmail(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Garmin Connect password</label>
              <input
                type="password"
                autoComplete="new-password"
                value={gcPass}
                onChange={e => setGcPass(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                placeholder="••••••••"
                required
              />
            </div>
            <button
              type="submit"
              disabled={gcLoading}
              className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white font-medium rounded-lg py-2 text-sm transition-colors"
            >
              {gcLoading ? 'Saving…' : 'Save Garmin credentials'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
