import { useQuery, useAction, getMyClaudeSubscription, removeMyClaudeSubscription } from 'wasp/client/operations'
import { ClaudeSignIn } from './ClaudeSignIn'
import { BUTTON, CARD, CardHeading, useCredentialCall } from './modelAccessParts'

/**
 * A person's own Claude subscription (models from one place, part 4): it serves Claude models for work in their own
 * place — their space and their personal projects — and nowhere else. Signing in, and signing out.
 */
export function ClaudeSubscriptionSection() {
  const { data, refetch } = useQuery(getMyClaudeSubscription)
  const remove = useAction(removeMyClaudeSubscription)
  const { busy, problem: error, run } = useCredentialCall()
  return (
    <section className={CARD} aria-label="Your Claude subscription">
      <CardHeading title="Your Claude subscription">
        Used for work in your own place: your space and your personal projects. Never in a shared project.
      </CardHeading>
      {data?.signedIn ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-small text-text-secondary">
            Signed in{data.expiresAt ? `, until ${new Date(data.expiresAt).toLocaleDateString()}` : ''}.
          </span>
          <button type="button" className={BUTTON} disabled={busy} onClick={() => void run(async () => { await remove(undefined); await refetch() })}>
            Sign out
          </button>
        </div>
      ) : (
        <ClaudeSignIn ownerType="user" onSignedIn={() => void refetch()} />
      )}
      {error && <p role="alert" className="mt-2 text-small text-danger">{error}</p>}
    </section>
  )
}
