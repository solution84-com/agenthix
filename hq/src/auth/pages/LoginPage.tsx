import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { login } from 'wasp/client/auth'
import { AuthLayout } from './parts/AuthLayout'
import { Heading, SECONDARY, TEXT_LINK, ProblemScreen } from './parts/authUi'
import { SignInForm } from './parts/SignInForm'
import { CloudSignInOption } from './parts/CloudSignInOption'
import { usePublicIdentity, type ShownIdentity } from './parts/orgCard'
import { BRANDING } from '@agenthix/core'

const STORAGE_KEY = 'agenthix_remembered_credentials'

// Only the username is remembered, never the password.
function rememberedUsername(): string {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    return typeof parsed?.username === 'string' ? parsed.username : ''
  } catch { return '' }
}

function remember(username: string | null) {
  try {
    if (username) localStorage.setItem(STORAGE_KEY, JSON.stringify({ username }))
    else localStorage.removeItem(STORAGE_KEY)
  } catch { /* storage refused: nothing is remembered */ }
}

type Refusal = { statusCode?: number; message?: string }

/** The words for a refused sign-in: never which of the two was wrong. */
export function signInMessage(err: unknown): { kind: 'removed' } | { kind: 'message'; text: string } {
  const { statusCode, message } = (err ?? {}) as Refusal
  if (statusCode === 403) return { kind: 'removed' }
  if (statusCode === 429 && message) return { kind: 'message', text: message }
  if (statusCode === 401 || statusCode === 400) return { kind: 'message', text: "That username and password don't match." }
  return { kind: 'message', text: 'Something went wrong. Try again.' }
}

function ForgotPassword({ org, onBack }: { org: string | null; onBack: () => void }) {
  return (
    <>
      <Heading title="Forgot your password?" lead="HQ doesn't keep email addresses, so it can't send you a link." />
      <div className="rounded-xl border border-border-subtle px-3 py-2.5 text-small text-text-secondary">
        <b className="font-medium text-text-primary">Ask an admin of {org ?? 'your organisation'}</b> for a reset link. They make one in Organisation › People.
      </div>
      <details className="mt-3.5 text-small text-text-muted">
        <summary className={`cursor-pointer ${TEXT_LINK}`}>If you're the only admin</summary>
        <p className="mt-1.5">
          Whoever runs HQ's machine can make a link there with a command: <code className="font-mono text-text-secondary">./{BRANDING.cliCommand} reset-password &lt;username&gt;</code>.
        </p>
      </details>
      <button type="button" onClick={onBack} className={`${SECONDARY} mt-5 w-full`}>Back to sign in</button>
    </>
  )
}

function FirstAdminWaiting({ identity }: { identity: ShownIdentity | null }) {
  return (
    <AuthLayout identity={identity}>
      <Heading title={`Set up ${BRANDING.displayName}`} lead="This HQ has no admin yet." />
      <p className="text-body text-text-secondary">
        Open the setup link printed in HQ's log, or run <code className="font-mono text-text-primary">./{BRANDING.cliCommand} invite-admin</code> on HQ's machine to print a new one.
      </p>
    </AuthLayout>
  )
}

export function LoginPage() {
  const navigate = useNavigate()
  const { identity, loaded } = usePublicIdentity()
  const [bootstrap, setBootstrap] = useState<boolean | null>(null)
  const [username, setUsername] = useState(rememberedUsername)
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(() => rememberedUsername() !== '')
  const [view, setView] = useState<'sign-in' | 'forgot' | 'removed'>('sign-in')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/auth/bootstrap-status')
      .then(r => r.json())
      .then(data => setBootstrap(!!data.bootstrapRequired))
      .catch(() => setBootstrap(false))
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login({ username, password })
      remember(rememberMe ? username : null)
      navigate('/')
    } catch (err) {
      const outcome = signInMessage(err)
      if (outcome.kind === 'removed') setView('removed')
      else setError(outcome.text)
    } finally {
      setBusy(false)
    }
  }

  if (!loaded || bootstrap === null) return <div className="min-h-screen bg-surface-1" />
  const org = identity?.name ?? null
  if (bootstrap) return <FirstAdminWaiting identity={identity} />
  if (view === 'removed') {
    return (
      <ProblemScreen
        identity={identity}
        title={`You no longer have access to ${org ?? 'this organisation'}`}
        actions={<button type="button" className={SECONDARY} onClick={() => { setView('sign-in'); setPassword('') }}>Back</button>}
      >
        An admin removed this account. If that is a mistake, ask an admin to reactivate it.
      </ProblemScreen>
    )
  }

  return (
    <AuthLayout identity={identity}>
      {view === 'forgot' ? <ForgotPassword org={org} onBack={() => setView('sign-in')} /> : (
        <>
        <SignInForm
          org={org}
          values={{ username, password, rememberMe }}
          error={error}
          busy={busy}
          onChange={next => {
            if (next.username !== undefined) setUsername(next.username)
            if (next.password !== undefined) setPassword(next.password)
            if (next.rememberMe !== undefined) setRememberMe(next.rememberMe)
          }}
          onSubmit={submit}
          onForgot={() => setView('forgot')}
        />
        <CloudSignInOption org={org} />
        </>
      )}
    </AuthLayout>
  )
}
