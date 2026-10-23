import { BRANDING } from '@agenthix/core'
import { ProblemScreen, SignInInstead } from './authUi'
import type { InviteRefusal } from './linkApi'
import type { PublicIdentity } from './orgCard'

const TITLES: Partial<Record<InviteRefusal['reason'], string>> = {
  expired: 'This invitation has expired',
  used: 'This invitation has already been used',
  revoked: 'This invitation was withdrawn',
}

/** An invitation that cannot be used: one sentence naming who to ask, and Sign in instead. An unknown code says only that it does not work. */
const SETUP_LINK_TITLES: Partial<Record<InviteRefusal['reason'], string>> = {
  expired: 'This setup link has expired',
  used: 'This setup link was already used',
  already_set_up: 'This setup link was already used',
  revoked: 'This setup link was replaced by a newer one',
}

function NewLinkCommand() {
  return <code className="font-mono text-text-primary">{BRANDING.cliCommand} hq invite-admin</code>
}

/** U2: a setup link that is not the open one. Before the first account only that link works, so the way on is a new one. */
function SetupLinkProblem({ refusal, identity }: { refusal: InviteRefusal; identity: PublicIdentity | null }) {
  const title = SETUP_LINK_TITLES[refusal.reason] ?? "This setup link doesn't work"
  return (
    <ProblemScreen identity={identity} title={title} actions={null}>
      Setup links work once, for 24 hours. On the machine HQ runs on, run <NewLinkCommand /> for a new one.
    </ProblemScreen>
  )
}

export function InviteProblem({ refusal, identity }: { refusal: InviteRefusal; identity: PublicIdentity | null }) {
  const org = identity?.name ?? null
  if (identity?.claimState === 'unclaimed') return <SetupLinkProblem refusal={refusal} identity={identity} />
  if (identity?.claimState === 'setting_up' && refusal.reason !== 'rate_limited') {
    return (
      <ProblemScreen identity={identity} title={SETUP_LINK_TITLES[refusal.reason] ?? "This link doesn't work"} actions={<SignInInstead primary />}>
        If you made the first account, sign in: setup carries on where it stopped.
      </ProblemScreen>
    )
  }
  if (refusal.reason === 'already_set_up') {
    return (
      <ProblemScreen identity={identity} title={`${org ? `${org}'s` : 'This'} HQ is already set up`} actions={<SignInInstead primary />}>
        The setup link works only before the first account. Sign in, or ask an admin for an invitation.
      </ProblemScreen>
    )
  }
  const title = TITLES[refusal.reason] ?? "This invitation link doesn't work"
  const ask = refusal.askWho ?? `an admin of ${org ?? 'your organisation'}`
  const detail = refusal.reason === 'unknown' || refusal.reason === 'rate_limited' ? refusal.error : `Ask ${ask} for a new one.`
  return <ProblemScreen identity={identity} title={title} actions={<SignInInstead />}>{detail}</ProblemScreen>
}
