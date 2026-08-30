import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useStore } from '../store/store'
import type { AppState } from '../types'
import {
  clearSupabaseConfig,
  getClient,
  getSupabaseConfig,
  pullBudget,
  pushBudget,
  saveSupabaseConfig,
} from '../lib/supabase'
import { Card, ConfirmButton, Field, toast } from './ui'

function hasAnyData(s: AppState): boolean {
  return (
    s.accounts.length > 0 ||
    s.transactions.length > 0 ||
    s.incomeRules.length > 0 ||
    s.payables.length > 0 ||
    s.goals.length > 0
  )
}

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return 'Could not reach Supabase. If you are using the Claude artifact link, external connections are blocked there — cloud sync works on the GitHub Pages site or when running locally.'
  }
  return msg
}

export function Cloud() {
  const { state, dispatch } = useStore()
  const [config, setConfig] = useState(getSupabaseConfig())
  const [urlInput, setUrlInput] = useState('')
  const [keyInput, setKeyInput] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [session, setSession] = useState<Session | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [lastSync, setLastSync] = useState('')
  const [conflict, setConflict] = useState<{ cloudUpdatedAt: string; cloudData: AppState } | null>(null)
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  // Track auth session while configured
  useEffect(() => {
    const sb = getClient()
    if (!sb) return
    sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = sb.auth.onAuthStateChange((_evt, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [config])

  // Auto-sync: push 2.5s after the last change while signed in (and no conflict pending)
  useEffect(() => {
    const sb = getClient()
    if (!sb || !session || conflict) return
    const t = setTimeout(async () => {
      try {
        const at = await pushBudget(sb, session.user.id, stateRef.current)
        setLastSync(at)
        setError('')
      } catch (e) {
        setError(friendlyError(e))
      }
    }, 2500)
    return () => clearTimeout(t)
  }, [state, session, conflict])

  const connect = () => {
    const url = urlInput.trim().replace(/\/+$/, '')
    const anonKey = keyInput.trim()
    if (!/^https:\/\/.+\.supabase\.co$/.test(url)) {
      setError('The project URL should look like https://xxxx.supabase.co')
      return
    }
    if (anonKey.length < 20) {
      setError('That does not look like an anon/publishable key.')
      return
    }
    saveSupabaseConfig({ url, anonKey })
    setConfig({ url, anonKey })
    setUrlInput('')
    setKeyInput('')
    setError('')
    toast('Connected to your Supabase project. Now sign in below.')
  }

  const afterSignIn = async (userId: string) => {
    const sb = getClient()!
    const cloud = await pullBudget(sb, userId)
    if (!cloud) {
      const at = await pushBudget(sb, userId, stateRef.current)
      setLastSync(at)
      toast('Cloud copy created from this device.')
    } else if (!hasAnyData(stateRef.current)) {
      dispatch({ type: 'load', state: cloud.data })
      setLastSync(cloud.updated_at)
      toast('Loaded your budget from the cloud.')
    } else {
      setConflict({ cloudUpdatedAt: cloud.updated_at, cloudData: cloud.data })
    }
  }

  const signIn = async (createAccount: boolean) => {
    const sb = getClient()
    if (!sb) return
    setBusy(true)
    setError('')
    try {
      const creds = { email: email.trim(), password }
      const { data, error: err } = createAccount ? await sb.auth.signUp(creds) : await sb.auth.signInWithPassword(creds)
      if (err) throw new Error(err.message)
      if (createAccount && !data.session) {
        setError('Account created — confirm the email Supabase sent you, then sign in here. (You can disable email confirmation under Authentication → Sign In / Up in Supabase to skip this.)')
        return
      }
      if (data.session) await afterSignIn(data.session.user.id)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  const syncNow = async () => {
    const sb = getClient()
    if (!sb || !session) return
    setBusy(true)
    try {
      const at = await pushBudget(sb, session.user.id, stateRef.current)
      setLastSync(at)
      setError('')
      toast('Synced to cloud.')
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  const loadFromCloud = async () => {
    const sb = getClient()
    if (!sb || !session) return
    setBusy(true)
    try {
      const cloud = await pullBudget(sb, session.user.id)
      if (!cloud) {
        toast('No cloud copy exists yet.')
      } else {
        dispatch({ type: 'load', state: cloud.data })
        setLastSync(cloud.updated_at)
        toast('Loaded budget from cloud.')
      }
      setError('')
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  const resolveConflict = async (useCloud: boolean) => {
    if (!conflict || !session) return
    const sb = getClient()!
    setBusy(true)
    try {
      if (useCloud) {
        dispatch({ type: 'load', state: conflict.cloudData })
        setLastSync(conflict.cloudUpdatedAt)
        toast('Loaded the cloud copy.')
      } else {
        const at = await pushBudget(sb, session.user.id, stateRef.current)
        setLastSync(at)
        toast('Cloud copy replaced with this device’s data.')
      }
      setConflict(null)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    await getClient()?.auth.signOut()
    setSession(null)
    setLastSync('')
    setConflict(null)
  }

  return (
    <div className="stack">
      <Card title="Cloud sync — Supabase">
        {!config ? (
          <>
            <p className="muted">
              Sync your budget to your own free Supabase database so it follows you across phone and computer.
              One-time setup (~3 minutes):
            </p>
            <ol className="setup-steps">
              <li>Create a free project at <strong>supabase.com</strong></li>
              <li>In the project: <strong>SQL Editor → New query</strong>, paste the contents of <code>supabase/setup.sql</code> from the PesoWise repo, and Run</li>
              <li>Optional but easiest: <strong>Authentication → Sign In / Up → disable "Confirm email"</strong></li>
              <li>Copy <strong>Project URL</strong> and the <strong>anon / publishable key</strong> from Settings → API Keys, and paste them here:</li>
            </ol>
            <div className="form-grid">
              <Field label="Project URL">
                <input value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="https://xxxx.supabase.co" autoComplete="off" />
              </Field>
              <Field label="Anon / publishable key">
                <input value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="eyJ… or sb_publishable_…" autoComplete="off" />
              </Field>
              <div className="form-actions">
                <button className="btn primary" onClick={connect}>Connect</button>
              </div>
            </div>
            <p className="muted">
              The anon key is safe to use in a browser app — Row Level Security (set up by the SQL script) means each
              account can only ever read its own data.
            </p>
          </>
        ) : !session ? (
          <>
            <p className="muted">
              Connected to <strong>{config.url.replace('https://', '')}</strong>. Sign in (or create an account) to sync.
              Use the same email + password on every device.
            </p>
            <div className="form-grid">
              <Field label="Email">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </Field>
              <Field label="Password">
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </Field>
              <div className="form-actions" style={{ gap: 8 }}>
                <button className="btn primary" disabled={busy || !email || !password} onClick={() => signIn(false)}>Sign in</button>
                <button className="btn ghost" disabled={busy || !email || !password} onClick={() => signIn(true)}>Create account</button>
              </div>
            </div>
            <ConfirmButton label="Disconnect project" onConfirm={() => { clearSupabaseConfig(); setConfig(null) }} />
          </>
        ) : conflict ? (
          <>
            <p>
              ☁️ A cloud copy of your budget already exists (last updated{' '}
              <strong>{new Date(conflict.cloudUpdatedAt).toLocaleString('en-PH')}</strong>), and this device also has
              data. Which one should win?
            </p>
            <div className="row-actions">
              <button className="btn primary" disabled={busy} onClick={() => resolveConflict(true)}>
                Use cloud copy (replace this device)
              </button>
              <button className="btn ghost" disabled={busy} onClick={() => resolveConflict(false)}>
                Keep this device's data (replace cloud)
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              ✅ Signed in as <strong>{session.user.email}</strong> — changes auto-sync a moment after you make them.
            </p>
            <p className="muted">
              {lastSync ? `Last synced: ${new Date(lastSync).toLocaleString('en-PH')}` : 'Not synced yet this session.'}
            </p>
            <div className="row-actions">
              <button className="btn primary" disabled={busy} onClick={syncNow}>Sync now</button>
              <ConfirmButton label="Load from cloud" confirmLabel="Replace local?" onConfirm={loadFromCloud} title="Replaces this device's data with the cloud copy" />
              <button className="btn ghost" disabled={busy} onClick={signOut}>Sign out</button>
            </div>
            <p className="muted">
              On another device: open PesoWise → Cloud → paste the same project URL + key → sign in with the same
              account, and your budget appears.
            </p>
          </>
        )}
        {error && <p className="bad-text">{error}</p>}
      </Card>
    </div>
  )
}
