import { useState } from 'react'
import { useQuery, getPledgeCard, dismissPledge } from 'wasp/client/operations'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import type { PledgeCardView } from '../../shared/homeTypes'

const TITLE = 'The Responsible AI Pledge — an Agenthix initiative'
const WHY = [
  'More and more people are worried about how AI is being used. But AI isn’t good or bad on its own: it’s as good as the people who use it.',
  'The pledge is a movement of people who commit to using it honestly, under their oversight, and owning what it does.',
]
const FREE = 'It’s free to sign, and your badge shows the people you work with where you stand.'
const ONE_STEP = 'You’re already signed in to Agenthix Cloud, so joining takes one step, and your badge is ready to share.'

const link = `rounded text-small font-medium text-link hover:underline ${FOCUS_RING}`
const out = { target: '_blank', rel: 'noreferrer' } as const

type Shown = Exclude<PledgeCardView, { kind: 'none' }>

function words(card: Shown): { title: string; lines: string[] } {
  if (card.kind === 'newVersion') {
    return {
      title: 'The Responsible AI Pledge has a new version',
      lines: [`Thank you for signing version ${card.signedVersion}. Version ${card.currentVersion} is out: see what changed, and sign it to keep your badge current.`],
    }
  }
  return { title: TITLE, lines: [...WHY, card.kind === 'inviteLinked' ? ONE_STEP : FREE] }
}

function Links({ card }: { card: Shown }) {
  if (card.kind === 'newVersion') return <a href={card.signUrl} {...out} className={link}>See what changed ↗</a>
  if (card.kind === 'invite') return <a href={card.pageUrl} {...out} className={link}>Join the movement ↗</a>
  return (
    <span className="flex flex-wrap gap-x-4">
      <a href={card.signUrl} {...out} className={link}>Join the movement ↗</a>
      <a href={card.pageUrl} {...out} className={`rounded text-small text-link hover:underline ${FOCUS_RING}`}>What it asks ↗</a>
    </span>
  )
}

/**
 * An invitation to join the Responsible AI Pledge, last on Home, in the state the server answers (home/pledge.ts):
 * the plain invitation, one that signs straight on Cloud for a linked account, or a new version for someone who
 * signed an earlier one. Nothing for someone who signed the current version. Each link carries nothing.
 */
export function PledgeCard() {
  const { data, refetch } = useQuery(getPledgeCard)
  const [gone, setGone] = useState(false)
  if (!data || data.kind === 'none' || gone) return null
  const card = data
  const { title, lines } = words(card)

  function dismiss() {
    setGone(true)
    void dismissPledge(card.kind === 'newVersion' ? { newVersion: card.currentVersion } : undefined).then(() => refetch(), () => setGone(false))
  }

  return (
    <section aria-label={title} className="relative rounded-2xl border border-border bg-card px-5 py-4">
      <button type="button" aria-label="Dismiss" onClick={dismiss} className="absolute right-3 top-3 text-text-muted hover:text-text-primary">×</button>
      <h2 className="pr-6 text-body font-medium text-text-primary">{title}</h2>
      {lines.map(line => <p key={line} className="mt-1 text-small text-text-secondary">{line}</p>)}
      <div className="mt-3"><Links card={card} /></div>
    </section>
  )
}
