import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAction, useQuery, acceptSkillProposal, getSkillProposalReview, rejectSkillProposal } from 'wasp/client/operations'
import { ChangesList } from '@agenthix/ui/files'
import { AppLayout } from '../../../shared/layouts/AppLayout'
import { refusalText } from '../../../shared/refusal'
import { LIBRARY_PATH, libraryAssetPath } from '../../../library/components/libraryRoutes'
import { useDock } from '../../../dock/DockContext'
import { filesToSend, isEdited, liveChanges, type Edits } from './liveChanges'
import { ReviewEditor } from './ReviewEditor'
import { reviewWords } from './reviewWords'
import { isDenied, retryUnlessDenied } from '../../../projects/place/retryUnlessDenied'
import { FIELD as FIELD_LOOK, FOCUS_RING, DISABLED, BUTTON_PRIMARY, BUTTON_SECONDARY } from '@agenthix/ui/primitives'
import { ReadFailure, ShowAttention } from '@agenthix/ui/attention'

const BUTTON = 'rounded-lg px-3 py-1.5 text-body font-medium max-lg:min-h-10'
const PLAIN = `${BUTTON} ${BUTTON_SECONDARY}`
const MAIN = `${BUTTON} ${BUTTON_PRIMARY}`
export const QUEUE_PATH = `${LIBRARY_PATH}/proposals`

/**
 * One proposal waiting for review (board R1): why it was proposed, the change line by line against what is in use, and
 * Accept, Edit then accept, or Reject with a note. Every file is in the change, scripts included, so what is accepted
 * is what was read. The reviewer's right is the policy's, checked again when they accept.
 */
export function ProposalReviewPage() {
  const { proposalId } = useParams<{ proposalId: string }>()
  const { data, error, refetch } = useQuery(getSkillProposalReview, { proposalId }, { retry: retryUnlessDenied })
  const accept = useAction(acceptSkillProposal)
  const reject = useAction(rejectSkillProposal)
  const [mode, setMode] = useState<'view' | 'edit' | 'reject'>('view')
  const [edits, setEdits] = useState<Edits>({})
  const [note, setNote] = useState('')
  const [state, setState] = useState<{ busy: boolean; error: string | null; done: string | null }>({ busy: false, error: null, done: null })
  // A new skill accepted into the Library: no agent has it yet, so the reviewer goes on to choose (board R1).
  const [madeAsset, setMadeAsset] = useState<string | null>(null)
  const dock = useDock()

  const crumbs = (last: string) => [{ label: 'Library', href: LIBRARY_PATH }, { label: 'Waiting for review', href: QUEUE_PATH }, { label: last }]
  // A not-found or not-yours answer is HQ's answer, so the page says it; only a read that got no answer opens the dialog.
  if (error && isDenied(error)) return <AppLayout breadcrumbs={crumbs('Not found')}><p role="alert" className="px-4 py-6 text-body text-text-primary lg:px-8">{refusalText(error)}</p></AppLayout>
  if (error) return <AppLayout breadcrumbs={crumbs('Not found')}><ReadFailure what="The proposal" retry={() => void refetch()} /></AppLayout>
  if (!data) return <AppLayout breadcrumbs={crumbs('…')}><p className="px-4 py-6 text-body text-text-muted lg:px-8">Loading…</p></AppLayout>

  const { proposal: p, files, changes } = data
  const edited = isEdited(files, edits)
  const shown = liveChanges(changes, files, edits)
  const words = reviewWords(p, data.acceptsAs)

  const run = async (work: () => Promise<string>) => {
    setState({ busy: true, error: null, done: null })
    try {
      setState({ busy: false, error: null, done: await work() })
      setMode('view')
    } catch (err) {
      setState({ busy: false, error: refusalText(err), done: null })
    }
    void refetch()
  }
  const onAccept = () => void run(async () => {
    const out = await accept({ proposalId: p.id, digest: p.digest, note: note.trim() || undefined, ...(edited ? { files: filesToSend(files, edits) } : {}) })
    const made = !p.edits && out.assetId ? out.assetId : null
    setMadeAsset(made)
    const accepted = `${out.state === 'ACCEPTED_WITH_CHANGES' ? 'Accepted with your changes' : 'Accepted'}: ${out.version}.`
    if (!out.switchedOn) return `${accepted} It is published but not switched on, so agents don't use it yet: this place doesn't run skills found in its files, or they changed since. Fix that on the place's Skills page, then switch it on.`
    return `${accepted}${made ? '' : ' Agents that have it use it from their next turn.'}`
  })
  const onReject = () => void run(async () => {
    await reject({ proposalId: p.id, digest: p.digest, note })
    return 'Rejected. The agent and the person are told, with your note.'
  })

  return (
    <AppLayout breadcrumbs={crumbs(p.name)}>
      <div className="mx-auto max-w-4xl px-4 py-5 lg:px-8" data-testid="proposal-review">
        <h1 className="text-h1 font-medium text-text-primary">{words.heading}</h1>
        <p className="mt-1 text-small text-text-muted">
          {words.line}
          {p.conversationId && dock && (
            <> · <button type="button" className={`rounded font-medium text-link hover:underline ${FOCUS_RING}`} onClick={() => dock.openConversation(p.conversationId!, null)}>Open the conversation</button></>
          )}
        </p>
        {p.edits && <p className="mt-1 text-small text-text-secondary">Changes <span className="font-mono">{p.edits}</span></p>}
        {p.why && <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-body text-text-primary">Why, from {p.proposedBy ?? 'the proposer'}: “{p.why}”</p>}
        {p.description && <p className="mt-2 text-body text-text-secondary">{p.description}</p>}

        <h2 className="mt-5 text-h3 font-medium text-text-primary">The change</h2>
        <div className="mt-2">
          {mode === 'edit' && <div className="mb-3"><ReviewEditor files={files} edits={edits} onEdit={(path, text) => setEdits(e => ({ ...e, [path]: text }))} /></div>}
          <ChangesList files={shown} />
        </div>
        <p className="mt-2 text-small text-text-muted">{words.checked(files.length)}</p>

        {p.state !== 'OPEN' ? (
          <p className="mt-5 text-body text-text-secondary" data-testid="proposal-outcome">{words.outcome}</p>
        ) : p.mayReview ? (
          <div className="mt-5 space-y-3">
            {mode === 'reject' ? (
              <>
                <label className="block text-body text-text-primary" htmlFor="reject-note">A note for {p.proposedFor ?? 'the person'}{p.proposedBy ? ` and ${p.proposedBy}` : ''}</label>
                <textarea id="reject-note" value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Why it isn't accepted"
                  className={`w-full rounded-lg px-3 py-2 text-body ${FIELD_LOOK}`} />
                <div className="flex gap-2">
                  <button type="button" className={PLAIN} disabled={state.busy} onClick={() => setMode('view')}>Cancel</button>
                  <button type="button" className={`${BUTTON} bg-button-danger text-button-danger-text not-disabled:hover:bg-button-danger-hover ${FOCUS_RING} ${DISABLED}`} disabled={state.busy || !note.trim()} onClick={onReject}>Reject</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-small text-text-secondary">{words.accepting}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={MAIN} disabled={state.busy} onClick={onAccept}>{edited ? `${words.acceptLabel}, with my changes` : words.acceptLabel}</button>
                  <button type="button" className={PLAIN} disabled={state.busy} onClick={() => setMode(mode === 'edit' ? 'view' : 'edit')}>{mode === 'edit' ? 'Stop editing' : 'Edit, then accept'}</button>
                  <button type="button" className={PLAIN} disabled={state.busy} onClick={() => setMode('reject')}>Reject…</button>
                </div>
              </>
            )}
          </div>
        ) : (
          <p className="mt-5 text-body text-text-secondary">{words.waiting}</p>
        )}
        <ShowAttention kind="alert" text={state.error} title="The proposal was not answered" onClose={() => setState(s => ({ ...s, error: null }))} />
        {state.done && (
          <p role="status" className="mt-3 text-body text-text-primary" data-testid="proposal-done">
            {state.done}{' '}
            {madeAsset
              ? <>No agent has it yet. <Link to={libraryAssetPath(madeAsset)} className={`rounded font-medium text-link hover:underline ${FOCUS_RING}`}>Add to agents…</Link></>
              : <Link to={LIBRARY_PATH} className={`rounded font-medium text-link hover:underline ${FOCUS_RING}`}>Open the Library</Link>}
          </p>
        )}
      </div>
    </AppLayout>
  )
}
