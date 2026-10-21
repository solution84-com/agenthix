import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { login } from 'wasp/client/auth'
import { getSessionId } from 'wasp/client/api'
import { forgetLinkToken, takeLinkToken } from '../linkToken'
import { AuthLayout } from './parts/AuthLayout'
import { Field, FormError, Heading, PRIMARY, ProblemScreen, SignInInstead } from './parts/authUi'
import { initialOf, usePublicIdentity, type ShownIdentity } from './parts/orgCard'

type ResetView = { person: { name: string; handle: string | null }; madeBy: { name: string } | null; expiresAt: string; org: ShownIdentity }
type Read = { view: ResetView } | { problem: string }

async function readReset(token: string): Promise<Read> {
  try {
    const res = await fetch('/api/auth/password-reset/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
    const data = await res.json().catch(() => ({}))
    return res.ok ? { view: data as ResetView } : { problem: data.error ?? "This reset link doesn't work." }
  } catch {
    return { problem: 'Something went wrong' }
  }
}

/** "works until tomorrow 14:02", "works until 14:02". */
export function untilText(expiresAt: string, now = new Date()): string {
  const at = new Date(expiresAt)
  const time = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const days = Math.round((new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000)
  return `works until ${days === 1 ? 'tomorrow ' : days > 1 ? `${at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ` : ''}${time}`
}

/**
 * The page a reset link opens (getting-in spec, Getting back in): whose account
 * it is and who made the link, then the new password twice. Setting it signs
 * them in and ends their other sign-ins.
 */
export function ResetPasswordPage() {
  const { token: tokenInAddress } = useParams<{ token?: string }>()
  const [token] = useState(() => takeLinkToken('reset', tokenInAddress, window.sessionStorage))
  const navigate = useNavigate()
  const { identity: publicIdentity } = usePublicIdentity()
  const [read, setRead] = useState<Read | null>(null)
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (tokenInAddress) navigate('/reset-password', { replace: true })
    if (!token) { setRead({ problem: "This reset link doesn't work." }); return }
    void readReset(token).then(setRead)
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== again) { setError('The two passwords are not the same'); return }
    setBusy(true)
    setError('')
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      const session = getSessionId()
      if (session) headers.Authorization = `Bearer ${session}`
      const res = await fetch('/api/auth/password-reset', { method: 'POST', headers, body: JSON.stringify({ token, password }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? 'Something went wrong'); return }
      forgetLinkToken('reset', window.sessionStorage)
      await login({ username: data.username, password })
      navigate('/')
    } catch {
      setError('Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  if (!read) return <div className="min-h-screen bg-surface-1" />
  if ('problem' in read) {
    return <ProblemScreen identity={publicIdentity} title="This reset link doesn't work" actions={<SignInInstead />}>{read.problem}</ProblemScreen>
  }
  const { view } = read
  return (
    <AuthLayout identity={view.org}>
      <div className="mb-5 flex items-start gap-3">
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-body font-semibold text-on-accent">{initialOf(view.person.name)}</span>
        <div>
          <div className="text-body"><b className="font-medium text-text-primary">{view.person.name}</b>{view.person.handle && <span className="text-text-secondary"> · @{view.person.handle}</span>}</div>
          <div className="text-small text-text-muted">Reset link from {view.madeBy ? view.madeBy.name : "HQ's machine"} · {untilText(view.expiresAt)}</div>
        </div>
      </div>
      <form onSubmit={submit}>
        <Heading title="Choose a new password" />
        {error && <FormError>{error}</FormError>}
        <Field id="new-password" label="New password" type="password" autoComplete="new-password" minLength={8} autoFocus value={password} onChange={e => setPassword(e.target.value)} required />
        <Field id="again" label="Again" type="password" autoComplete="new-password" minLength={8} value={again} onChange={e => setAgain(e.target.value)} required />
        <p className="mb-4 text-small text-text-muted">Your sign-ins on other browsers and your phone end.</p>
        <button type="submit" disabled={busy} className={PRIMARY}>{busy ? 'Setting…' : 'Set password and sign in'}</button>
      </form>
    </AuthLayout>
  )
}
