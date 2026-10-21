import { ProblemScreen, SignInInstead } from './authUi'
import type { InviteRefusal } from './linkApi'
import type { PublicIdentity } from './orgCard'

const TITLES: Partial<Record<InviteRefusal['reason'], string>> = {
  expired: 'This invitation has expired',
  used: 'This invitation has already been used',
  revoked: 'This invitation was withdrawn',
}

/** An invitation that cannot be used: one sentence naming who to ask, and Sign in instead. An unknown code says only that it does not work. */
export function InviteProblem({ refusal, identity }: { refusal: InviteRefusal; identity: PublicIdentity | null }) {
  const org = identity?.name ?? null
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
