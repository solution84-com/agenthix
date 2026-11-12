import { useEffect, useState } from 'react'
import { api, handleApiError, setSessionId } from 'wasp/client/api'
import { useAttention } from '@agenthix/ui/primitives'
import { BRANDING } from '@agenthix/core'
import { Heading, PRIMARY, TEXT_LINK } from '../auth/pages/parts/authUi'
import { nextResetLine } from './countdown'
import { DEMO_GUIDE_URL, DEMO_PRIVACY_URL } from './useDemo'

/** The notice on the entry page (live demo spec, *Getting in*). */
export const DEMO_NOTICE = "This demo is shared and wiped every 6 hours; don't type anything personal."

const leaveFor = (to: string) => window.location.assign(to)

/**
 * The sign-in page in demo mode, in place of the sign-in form: *Enter the demo*, the notice and the countdown to the
 * next wipe. The press makes a visitor's account and signs it in; above the demo's caps the button says which stops it.
 */
export function EnterDemoPanel({ nextResetAt, leave = leaveFor }: { nextResetAt: string; leave?: (to: string) => void }) {
  const [busy, setBusy] = useState(false)
  // Why the button no longer enters: the demo is full, or this network has entered too often this hour (finding 9).
  const [stopped, setStopped] = useState<{ label: string; text: string } | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const attention = useAttention()

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  async function enter() {
    setBusy(true)
    try {
      const { sessionId } = await api.post('api/demo/enter').json<{ sessionId: string }>()
      setSessionId(sessionId)
      leave('/')
    } catch (err) {
      const e = handleApiError(err) as { statusCode?: number; data?: { error?: string; reason?: string } }
      if (e.data?.reason === 'address') setStopped({ label: 'Too many visitors from your network', text: e.data.error ?? 'Too many visitors from your network this hour. Try again later.' })
      else if (e.data?.reason === 'full') setStopped({ label: 'The demo is full', text: e.data.error ?? 'The demo is full right now. Come back in a little while.' })
      else attention.show({ title: 'Could not enter the demo', text: 'HQ did not answer. Try again.', retry: () => void enter() })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Heading title={`Try ${BRANDING.displayName}`} lead="Walk into a working organisation: talk to its agents, start a task and watch it run." />
      <button
        type="button"
        className={PRIMARY}
        onClick={() => { if (!stopped) void enter() }}
        disabled={busy}
        aria-disabled={stopped ? true : undefined}
        aria-describedby={stopped ? 'demo-full' : undefined}
        data-testid="enter-demo"
      >
        {stopped ? stopped.label : busy ? 'Entering…' : 'Enter the demo'}
      </button>
      {stopped && <p id="demo-full" role="status" className="mt-2 text-small text-text-secondary">{stopped.text}</p>}
      <p className="mt-4 text-small text-text-secondary">{DEMO_NOTICE}</p>
      <p className="mt-1 text-small text-text-muted" data-testid="demo-countdown">{nextResetLine(nextResetAt, now)}</p>
      <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-small">
        <a href={DEMO_GUIDE_URL} target="_blank" rel="noreferrer" className={TEXT_LINK}>What the demo can and can't do ↗</a>
        <a href={DEMO_PRIVACY_URL} target="_blank" rel="noreferrer" className={TEXT_LINK}>Privacy ↗</a>
      </p>
      {attention.dialog}
    </>
  )
}
