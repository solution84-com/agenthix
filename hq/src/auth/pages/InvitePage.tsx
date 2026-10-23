import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { login, logout, useAuth } from 'wasp/client/auth'
import { forgetLinkToken, takeLinkToken } from '../linkToken'
import { AccountStep } from '../../setup/pages/steps/AccountStep'
import { JoinStep } from '../../onboarding/pages/steps/JoinStep'
import type { AccountForm } from './parts/AccountFields'
import { InviteProblem } from './parts/InviteProblem'
import { SwitchPerson } from './parts/SwitchPerson'
import { acceptInvite, readInvite, type InviteRead } from './parts/linkApi'
import { usePublicIdentity } from './parts/orgCard'

type Stage = 'reading' | 'form' | 'joining'

/**
 * The page every invitation link opens, `/invite/<code>` (getting-in spec, The
 * ways in): the first admin's link is setup's first step, anyone else's is
 * onboarding's Join. The code leaves the address bar once read. Nothing is
 * asked until the link has been read and shown to work: no code to paste, no
 * "verified" step. Once the account exists, the person carries on at the next
 * step of setup or onboarding.
 */
export function InvitePage() {
  const { token: tokenInAddress } = useParams<{ token?: string }>()
  const [token] = useState(() => takeLinkToken('invite', tokenInAddress, window.sessionStorage))
  const navigate = useNavigate()
  const { data: me } = useAuth()
  const { identity: publicIdentity } = usePublicIdentity()
  const [read, setRead] = useState<InviteRead | null>(null)
  const [stage, setStage] = useState<Stage>('reading')
  const [error, setError] = useState('')
  const [signedInAs, setSignedInAs] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    if (tokenInAddress) navigate('/invite', { replace: true })
    if (!token) { setRead({ ok: false, refusal: { reason: 'unknown', error: "This invitation link doesn't work.", askWho: null } }); setStage('form'); return }
    void readInvite(token).then(r => { setRead(r); setStage('form') })
  }, [])

  // Someone already signed in is asked before anything is replaced.
  const meName = (me as { identities?: { username?: { id?: string } } } | null | undefined)?.identities?.username?.id ?? null
  const asking = signedInAs ?? (stage === 'form' && !switching ? meName : null)

  async function submit(form: AccountForm) {
    if (!token || !read?.ok) return
    setStage('joining')
    setError('')
    const outcome = await acceptInvite({ token, ...form })
    if (!outcome.ok) {
      if ('signedInAs' in outcome) { setSignedInAs(outcome.signedInAs); setStage('form'); return }
      setError(outcome.error)
      setStage('form')
      return
    }
    forgetLinkToken('invite', window.sessionStorage)
    try {
      await login({ username: form.username, password: form.password })
    } catch {
      navigate('/login')
      return
    }
    // Step 1 was this page's form, so the next step is the second of setup or of onboarding.
    navigate(read.view.kind === 'first_admin' ? '/setup' : '/onboarding?step=you')
  }

  async function signOutAndContinue() {
    setBusy(true)
    setSwitching(true)
    await logout().catch(() => {})
    setBusy(false)
    setSignedInAs(null)
  }

  if (!read || stage === 'reading') return <div className="min-h-screen bg-surface-1" />
  if (!read.ok) return <InviteProblem refusal={read.refusal} identity={publicIdentity} />
  const { view } = read
  if (asking !== null) {
    return <SwitchPerson identity={view.org} signedInAs={asking} busy={busy} onContinue={() => void signOutAndContinue()} onCancel={() => navigate('/')} />
  }
  const joining = stage === 'joining'
  if (view.kind === 'first_admin') return <AccountStep busy={joining} error={error} onSubmit={form => void submit(form)} />
  return <JoinStep view={view} busy={joining} error={error} onSubmit={form => void submit(form)} />
}
