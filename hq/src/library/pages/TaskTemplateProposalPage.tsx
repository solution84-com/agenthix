import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAction, useQuery, acceptTaskTemplateProposal, getTaskTemplateProposal, rejectTaskTemplateProposal } from 'wasp/client/operations'
import { Button } from '@agenthix/ui/primitives'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { useAttention } from '../../shared/components/AttentionDialog'
import { refusalText } from '../../shared/refusal'
import { retryUnlessDenied } from '../../projects/place/retryUnlessDenied'
import { INPUT } from '../../projects/pages/settings/Part'
import { LIBRARY_PATH, libraryAssetPath } from '../components/libraryRoutes'
import { TaskTemplateHolds } from '../components/TaskTemplateHolds'
import type { TaskTemplateProposalView } from '../taskTemplates/templateReview'

const day = (at: string) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

function outcomeWords(p: TaskTemplateProposalView): string | null {
  if (p.state === 'OPEN') return null
  if (p.state === 'REJECTED') return `Not published${p.reviewedBy ? ` by ${p.reviewedBy}` : ''}${p.reviewNote ? `: “${p.reviewNote}”` : '.'}`
  return `Published${p.reviewedBy ? ` by ${p.reviewedBy}` : ''} as ${p.identity} 1.0.0.`
}

/**
 * A proposed task template, waiting for a Library maintainer (spec D16; the skills' rule, adr-0159): what it holds, who
 * proposed it, and for a reviewer Publish, the page's one filled button, or Reject with a note. The person who proposed
 * it reads the same page and its outcome. Publishing opens the template's Library page; no message.
 */
export function TaskTemplateProposalPage() {
  const { proposalId = '' } = useParams<{ proposalId: string }>()
  const navigate = useNavigate()
  const { data: p, error, refetch } = useQuery(getTaskTemplateProposal, { proposalId }, { retry: retryUnlessDenied })
  const accept = useAction(acceptTaskTemplateProposal)
  const reject = useAction(rejectTaskTemplateProposal)
  const attention = useAttention()
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')

  const crumbs = (last: string) => [{ label: 'Library', href: LIBRARY_PATH }, { label: 'Task templates', href: `${LIBRARY_PATH}?type=task-template` }, { label: last }]
  if (error) return <AppLayout breadcrumbs={crumbs('Not found')} title="Library"><p role="alert" className="px-4 py-5 text-body text-danger lg:px-8">{refusalText(error)}</p></AppLayout>
  if (!p) return <AppLayout breadcrumbs={crumbs('…')} title="Library"><p className="px-4 py-5 text-body text-text-muted lg:px-8">Loading…</p></AppLayout>

  const onPublish = () => {
    accept({ proposalId: p.id, digest: p.digest }).then(out => navigate(libraryAssetPath(out.assetId)),
      err => attention.show({ title: 'It was not published', text: refusalText(err), retry: onPublish }))
  }
  const onReject = () => {
    reject({ proposalId: p.id, digest: p.digest, note }).then(() => { setRejecting(false); void refetch() },
      err => attention.show({ title: 'It was not rejected', text: refusalText(err), retry: onReject }))
  }
  const outcome = outcomeWords(p)

  return (
    <AppLayout
      breadcrumbs={crumbs(p.title)}
      title={p.title}
      subtitle={`${p.identity} · Proposed${p.proposedBy ? ` by ${p.proposedBy}` : ''}, ${day(p.createdAt)}`}
      action={p.mayReview && !rejecting ? (
        <>
          <Button variant="secondary" onClick={() => setRejecting(true)}>Reject…</Button>
          <Button onClick={onPublish}>Publish</Button>
        </>
      ) : undefined}
      phoneActions={p.mayReview && !rejecting ? [{ label: 'Publish', onSelect: onPublish }, { label: 'Reject…', onSelect: () => setRejecting(true) }] : undefined}
    >
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-5 lg:px-8" data-testid="task-template-proposal">
        {p.description && <p className="text-body text-text-secondary">{p.description}</p>}
        <TaskTemplateHolds holds={p.holds} />
        {outcome ? (
          <p className="text-body text-text-secondary" data-testid="proposal-outcome">
            {outcome}{' '}
            {p.publishedAssetId && <Link to={libraryAssetPath(p.publishedAssetId)} className="font-medium text-accent hover:text-accent-hover">Open it in the Library</Link>}
          </p>
        ) : !p.mayReview ? (
          <p className="text-body text-text-secondary">A Library maintainer reviews it and publishes it. Nothing reaches the Library until then.</p>
        ) : rejecting ? (
          <div className="space-y-3">
            <label className="block text-small text-text-secondary" htmlFor="reject-note">A note for {p.proposedBy ?? 'the person who proposed it'}: why it isn't published</label>
            <textarea id="reject-note" value={note} onChange={e => setNote(e.target.value)} rows={3} className={`${INPUT} resize-none`} />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRejecting(false)}>Cancel</Button>
              <Button variant="danger" disabled={!note.trim()} title={note.trim() ? undefined : 'Say why it isn’t published'} onClick={onReject}>Reject</Button>
            </div>
          </div>
        ) : (
          <p className="text-small text-text-muted">Publishing makes it version 1.0.0 of {p.identity}, signed by your organisation. A project that adds it gets its own copy.</p>
        )}
      </div>
      {attention.dialog}
    </AppLayout>
  )
}
