import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { setSessionId } from 'wasp/client/api'
import { SECONDARY, ProblemScreen } from './parts/authUi'
import { usePublicIdentity } from './parts/orgCard'
import { finishCloudSignIn, type CloudReturn } from './parts/cloudSignInApi'

/** Leaves the page for `to` with a full load, so every query is read again as the person now signed in. */
const leaveFor = (to: string) => window.location.assign(to)

/**
 * Where Agenthix Cloud sends a person back to (`/login/cloud`): hq finishes the sign-in or the link, then signs them
 * in with its own session, or takes them back to Settings. A refusal says why, in hq's words.
 */
export function CloudReturnPage({ leave = leaveFor }: { leave?: (to: string) => void }) {
  const { search } = useLocation()
  const { identity } = usePublicIdentity()
  const [failed, setFailed] = useState<Extract<CloudReturn, { ok: false }> | null>(null)
  const started = useRef(false)

  useEffect(() => {
    // Once only: a sign-in's state is spent by the first try, so a second render must not send it again.
    if (started.current) return
    started.current = true
    void finishCloudSignIn(new URLSearchParams(search)).then(result => {
      if (!result.ok) return setFailed(result)
      if (result.outcome.kind === 'signedIn') {
        setSessionId(result.outcome.sessionId)
        leave('/')
      } else {
        leave('/settings#settings-sign-in')
      }
    })
  }, [search, leave])

  if (!failed) return <div className="min-h-screen bg-surface-1" aria-busy="true" />
  const linking = failed.purpose === 'link'
  return (
    <ProblemScreen
      identity={identity}
      title={linking ? 'Your Agenthix account is not linked' : 'You are not signed in'}
      actions={<Link to={linking ? '/settings' : '/login'} className={SECONDARY}>{linking ? 'Back to Settings' : 'Back to sign in'}</Link>}
    >
      {failed.error}
    </ProblemScreen>
  )
}
