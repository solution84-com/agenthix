import { useState } from 'react'
import { useQuery, useAction, getOrgIdentity, setSignInShows } from 'wasp/client/operations'
import { CARD_CLICKABLE, CARD_CHOSEN } from '@agenthix/ui/primitives'
import { useAttentionWhen } from '@agenthix/ui/attention'

type Shows = 'cover' | 'name' | 'nothing'

const CHOICES: Array<{ value: Shows; title: string; line: string }> = [
  { value: 'cover', title: 'The whole cover', line: 'Cover, picture, name, handle and vision, beside the form' },
  { value: 'name', title: 'The name only', line: "Just the organisation's name" },
  { value: 'nothing', title: 'Nothing', line: 'A plain sign-in form' },
]

/**
 * Organisation › Settings, Sign-in page (getting-in spec, Signing in): how much of
 * the organisation anyone can see before they sign in. Invitation, reset and
 * setup pages always show it whole: whoever holds one of those links is being let in.
 */
export function SignInPageSetting() {
  const { data: identity } = useQuery(getOrgIdentity)
  const save = useAction(setSignInShows)
  const [error, setError] = useState('')
  const errorDialog = useAttentionWhen(error)
  const [busy, setBusy] = useState(false)
  const current = identity?.signInShows as Shows | undefined

  async function choose(shows: Shows) {
    setBusy(true)
    setError('')
    try { await save({ shows }) } catch (err) { setError(err instanceof Error ? err.message : 'Could not save that') } finally { setBusy(false) }
  }

  return (
    <section aria-label="Sign-in page" className="mb-6">
      <h2 className="mb-1 text-micro font-medium uppercase tracking-wide text-text-muted">Sign-in page</h2>
      <p className="mb-2 text-small text-text-secondary">What anyone can see of the organisation before they sign in.</p>
      <div role="radiogroup" aria-label="What the sign-in page shows" className="grid gap-2 sm:grid-cols-3">
        {CHOICES.map(c => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={current === c.value}
            disabled={busy || !current}
            onClick={() => void choose(c.value)}
            className={`rounded-xl border p-3 text-left ${CARD_CLICKABLE} ${current === c.value ? CARD_CHOSEN : ''}`}
          >
            <span className="block text-body font-medium text-text-primary">{c.title}</span>
            <span className="block text-small text-text-muted">{c.line}</span>
          </button>
        ))}
      </div>
      {errorDialog}
    </section>
  )
}
