/**
 * Signing in with an HQ account that holds the fleet admin role (spec §7). HQ checks the password, so while it does
 * not answer nobody can sign in: the page says so and what to run on the machine. Through remote access a code from an
 * authenticator app is asked for too (cloud/RemoteSignIn.tsx); on the machine, never.
 */
import { useState, type FormEvent, type ReactNode } from 'react'
import { BRANDING } from '@agenthix/core'
import { Button, FormField, Input } from '@agenthix/ui/primitives'
import { ApiError } from '../api/client'
import { signIn, type ConsoleStatus } from '../api/session'
import { useAuth } from '../auth/AuthContext'
import { RemoteCodeFields, secondStepReady, useRemoteSignIn, type SecondStep } from '../cloud/RemoteSignIn'
import type { StatusState } from '../auth/useConsoleStatus'
import { Notice } from '../components'
import { Brand, WhereBadge } from '../shell/Brand'

const cli = (args: string) => <code className="font-mono text-[.92em]">{`${BRANDING.cliCommand} ${args}`}</code>

export function SignInPage({ status }: { status: StatusState & { refresh: () => void } }) {
  const ready = status.phase === 'ready' ? status.status : null
  return (
    <main className="flex min-h-screen flex-col items-center bg-surface-0 bg-[radial-gradient(520px_190px_at_50%_-70px,var(--color-frame-glow),transparent_70%),linear-gradient(180deg,var(--color-frame-wash),transparent_200px)] bg-no-repeat px-4 pt-14 pb-10">
      <div className="mb-4 flex flex-col items-center gap-2">
        <Brand />
        <WhereBadge machineName={ready?.machineName ?? null} />
      </div>
      <div className="w-full max-w-[380px] rounded-[14px] border border-border bg-card px-[22px] py-5 shadow-pop">
        {status.phase === 'loading' && <p className="text-small text-text-muted">Asking the Fleet Console…</p>}
        {status.phase === 'unreachable' && (
          <Notice title="The Fleet Console is not answering">{status.message}</Notice>
        )}
        {ready && ready.fleetAdmins === 'none' ? <NobodyHoldsTheRole status={ready} /> : ready && <SignInForm status={ready} onHqGone={status.refresh} />}
      </div>
    </main>
  )
}

function SignInForm({ status, onHqGone }: { status: ConsoleStatus; onHqGone: () => void }) {
  const { state, signedIn } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const remote = useRemoteSignIn()
  const [second, setSecond] = useState<SecondStep>({ code: '' })
  const [refusal, setRefusal] = useState<{ title?: string; message: string } | null>(null)
  const hqDown = status.hq !== 'connected'
  const ended = state.phase === 'signedOut' ? state.notice : undefined

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setRefusal(null)
    try {
      signedIn(await signIn(username.trim(), password, remote ? second : null))
    } catch (err) {
      setPassword('')
      setSecond('code' in second ? { code: '' } : { recoveryCode: '' })
      if (err instanceof ApiError && err.code === 'hq_unreachable') onHqGone()
      else setRefusal(refusalOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <h1 className="mb-1 text-h2 font-bold tracking-[-.015em] text-text-primary">Sign in</h1>
      <p className="text-body text-text-secondary">Sign in with your HQ account. You need the fleet admin role.</p>
      <p className="mb-4 mt-1.5 text-body text-text-secondary">
        {remote
          ? 'You came in through remote access, so a code is needed too.'
          : "You are on the Fleet Console's own machine (or a tunnel to it), so your HQ login is all you need."}
      </p>
      {ended && !refusal && <Notice>{ended}</Notice>}
      <div className="space-y-3">
        <FormField label="Username" htmlFor="sign-in-username">
          <Input id="sign-in-username" name="username" autoComplete="username" autoFocus value={username}
            onChange={e => setUsername(e.target.value)} />
        </FormField>
        <FormField label="Password" htmlFor="sign-in-password">
          <Input id="sign-in-password" name="password" type="password" autoComplete="current-password" value={password}
            onChange={e => setPassword(e.target.value)} />
        </FormField>
        {remote && <RemoteCodeFields step={second} onChange={setSecond} machineName={status.machineName} username={username.trim()} />}
      </div>
      <Button type="submit" className="mt-4" disabled={!hqDown && (busy || !username.trim() || !password || (remote && !secondStepReady(second)))}
        refusal={hqDown ? {
          reason: 'HQ is not answering, so your HQ login cannot be checked.',
          detail: <>On <b className="font-semibold">{status.machineName}</b>, run {cli('status')} to see why, and {cli('restore')} if HQ has to be brought back from a backup. Then try again.</>,
        } : undefined}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
      {refusal && <div className="mt-3"><Notice title={refusal.title}>{refusal.message}</Notice></div>}
    </form>
  )
}

function refusalOf(err: unknown): { title?: string; message: string } {
  if (!(err instanceof ApiError)) return { message: 'Something went wrong. Try again.' }
  if (err.code === 'not_fleet_admin') {
    return { title: "This account isn't a fleet admin.", message: 'A fleet admin can give you the role in the Fleet Console.' }
  }
  return { message: err.message }
}

function NobodyHoldsTheRole({ status }: { status: ConsoleStatus }) {
  return (
    <div>
      <h1 className="mb-1 text-h2 font-bold tracking-[-.015em] text-text-primary">Nobody holds the fleet admin role</h1>
      <p className="text-body text-text-secondary">
        The Fleet Console on <b className="font-semibold text-text-primary">{status.machineName}</b> is running, but no
        HQ account has the fleet admin role, so nobody can sign in to it.
      </p>
      <Step>
        <b className="font-semibold text-text-primary">Next step:</b> on HQ's machine, a machine admin
        runs {cli('hq fleet-admin <username>')} for the account that should hold it.
      </Step>
      <p className="mt-3 text-small text-text-muted">
        A machine admin is anyone who can use Docker on HQ's machine, at the machine or over SSH. An organisation admin
        cannot give the role.
      </p>
    </div>
  )
}

function Step({ children }: { children: ReactNode }) {
  return <div className="mt-3 rounded-xl border border-border bg-card px-3.5 py-2.5 text-small text-text-secondary">{children}</div>
}
