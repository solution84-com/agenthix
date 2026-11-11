import { useState } from 'react'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { Link } from 'react-router'
import { useQuery, getSkillProposalQueues } from 'wasp/client/operations'
import { AppLayout } from '../../../shared/layouts/AppLayout'
import { LIBRARY_PATH, libraryProposalPath } from '../../../library/components/libraryRoutes'
import type { QueueEntry, QueueLevel } from './queues'
import { retryUnlessDenied } from '../../../projects/place/retryUnlessDenied'
import { ReadFailure } from '@agenthix/ui/attention'

const STATE_WORD: Record<QueueEntry['state'], string> = {
  OPEN: 'Waiting for review', ACCEPTED: 'Accepted', ACCEPTED_WITH_CHANGES: 'Accepted with changes', REJECTED: 'Rejected',
}

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

function Entry({ e, decided }: { e: QueueEntry; decided: boolean }) {
  const who = [e.proposedBy && `Proposed by ${e.proposedBy}`, e.proposedFor && `for ${e.proposedFor}`].filter(Boolean).join(' ')
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3" data-testid="proposal-entry">
      <span className="w-12 shrink-0 text-micro font-medium uppercase text-text-muted">{e.edits ? 'edit' : 'new'}</span>
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-body font-medium text-text-primary">{e.name}</p>
        <p className="text-small text-text-muted">
          {who || 'Proposed'} · {decided ? `${STATE_WORD[e.state]}${e.reviewedBy ? ` by ${e.reviewedBy}` : ''}, ${when(e.reviewedAt ?? e.createdAt)}` : when(e.createdAt)}
        </p>
        {e.description && <p className="text-small text-text-secondary">{e.description}</p>}
      </div>
      <Link to={libraryProposalPath(e.id)} className={`rounded shrink-0 text-small font-medium text-link hover:underline ${FOCUS_RING}`}>{decided ? 'Open' : 'Review'}</Link>
    </li>
  )
}

function Level({ level }: { level: QueueLevel }) {
  const [showDecided, setShowDecided] = useState(false)
  return (
    <section aria-label={level.label} className="mt-6" data-testid="proposal-level">
      <h2 className="text-h3 font-medium text-text-primary">{level.label} <span className="text-small font-normal text-text-muted">· {level.open.length} waiting</span></h2>
      {level.open.length === 0
        ? <p className="mt-1 text-small text-text-muted">Nothing waits for review here.</p>
        : <ul className="divide-y divide-border-subtle">{level.open.map(e => <Entry key={e.id} e={e} decided={false} />)}</ul>}
      {level.decided.length > 0 && (
        <>
          <button type="button" aria-expanded={showDecided} onClick={() => setShowDecided(s => !s)} className={`rounded mt-2 text-small font-medium text-link hover:underline ${FOCUS_RING}`}>
            Decided in the last 30 days · {level.decided.length} {showDecided ? 'Hide' : 'Show'}
          </button>
          {showDecided && <ul className="divide-y divide-border-subtle">{level.decided.map(e => <Entry key={e.id} e={e} decided />)}</ul>}
        </>
      )}
    </section>
  )
}

/** Proposals waiting for review, by the level they aim at (spec part 5, D27): only the levels this person reviews. */
export function ProposalQueuePage() {
  const { data, error, refetch } = useQuery(getSkillProposalQueues, undefined, { retry: retryUnlessDenied })
  return (
    <AppLayout
      breadcrumbs={[{ label: 'Library', href: LIBRARY_PATH }, { label: 'Waiting for review' }]}
      title="Waiting for review"
      subtitle="Drafts proposed by agents or people. None reaches an agent until it's accepted."
    >
      <div className="mx-auto max-w-4xl px-4 pb-8 lg:px-8">
        {error ? <ReadFailure what="The proposals" retry={() => void refetch()} />
          : !data ? <p className="pt-5 text-body text-text-muted">Loading…</p>
          : data.map(l => <Level key={`${l.level}-${l.projectId ?? ''}`} level={l} />)}
      </div>
    </AppLayout>
  )
}
