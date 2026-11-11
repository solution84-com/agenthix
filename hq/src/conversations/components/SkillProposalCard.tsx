import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { BUTTON_PRIMARY, BUTTON_SECONDARY, Button, FIELD, NativeSelect, FOCUS_RING } from '@agenthix/ui/primitives'
import type { SkillDraftCardView, SkillProposalView } from '../../assets/proposals/view'
import { ShowAttention } from '@agenthix/ui/attention'

const BUTTON = 'rounded-lg px-3 py-1 text-small font-medium max-lg:min-h-10'
const PLAIN = `${BUTTON} ${BUTTON_SECONDARY}`
const MAIN = `${BUTTON} ${BUTTON_PRIMARY}`
const AIM_WORD = { organisation: 'the organisation', project: 'the project', person: 'yourself' } as const

function whereFor(p: SkillProposalView): string {
  if (p.aim === 'ORGANISATION') return 'For the organisation\'s Library'
  if (p.aim === 'PERSON') return 'For you'
  return `For ${p.placeName ?? 'the project'}`
}

function outcomeText(p: SkillProposalView): string {
  const who = p.reviewedBy ?? 'a reviewer'
  if (p.state === 'ACCEPTED') return `Accepted by ${who}. It is published, and agents there use it from their next turn.`
  if (p.state === 'ACCEPTED_WITH_CHANGES') return `Accepted with changes by ${who}. It is published, and agents there use it from their next turn.`
  if (p.state === 'REJECTED') return `Not accepted by ${who}${p.reviewNote ? `: "${p.reviewNote}"` : '.'}`
  return `Waiting for review by ${p.reviewers}`
}

export type ProposalCardActions = {
  busy: boolean
  error: string | null
  onAccept: (edited: string | null, note: string) => void
  onReject: (note: string) => void
  onAim: (aim: SkillProposalView['aims'][number]) => void
}

/**
 * A skill an agent proposed (board C3): what it is, for whom, who proposed it and who reviews it, its SKILL.md, and the
 * outcome once reviewed. Accept, Edit first and Not accepted are shown only to people who may review it there; the
 * person it was proposed for may aim it elsewhere while it waits. Nothing here makes it run until it is accepted.
 */
export function SkillProposalCard({ proposal: p, actions }: { proposal: SkillProposalView; actions: ProposalCardActions }) {
  const skillMd = p.files.find((f) => f.path === 'SKILL.md')?.text ?? ''
  const [mode, setMode] = useState<'view' | 'edit' | 'reject'>('view')
  const [edited, setEdited] = useState(skillMd)
  const [note, setNote] = useState('')
  const [showAll, setShowAll] = useState(false)
  // Accepting publishes every file, scripts included: the reviewer sees them all first (security review H5).
  const hidden = skillMd.split('\n').length > 8 || p.files.length > 1
  const seenAll = showAll || !hidden
  const preview = showAll ? skillMd : skillMd.split('\n').slice(0, 8).join('\n')
  const changed = p.changes ? [...p.changes.added.map((f) => `+ ${f}`), ...p.changes.changed.map((f) => `~ ${f}`), ...p.changes.removed.map((f) => `- ${f}`)] : []
  return (
    <div className="bg-surface-2 px-3 py-2" data-testid="skill-proposal-card">
      <div className="flex items-start gap-2">
        <Sparkles size={14} aria-hidden className="mt-0.5 shrink-0 text-text-secondary" />
        <div className="min-w-0 flex-1 space-y-1 text-small">
          <p className="break-words font-medium text-text-primary">
            {p.edits ? 'Proposed change' : 'Proposed skill'} · {p.name}
            <span className="ml-2 font-normal text-micro text-text-muted" data-testid="skill-proposal-state">{p.state === 'OPEN' ? 'Waiting for review' : p.state === 'REJECTED' ? 'Not accepted' : 'Accepted'}</span>
          </p>
          {p.description && <p className="break-words text-micro text-text-secondary">{p.description}</p>}
          <p className="text-micro text-text-muted">
            {whereFor(p)} · {p.edits ? `Changes ${p.edits}` : 'New skill'} · {p.files.length} {p.files.length === 1 ? 'file' : 'files'}
            {p.proposedBy && ` · Proposed by ${p.proposedBy}${p.proposedFor ? `, for ${p.proposedFor}` : ''}`}
          </p>
          {p.makesCopy && <p className="text-micro text-text-muted">Accepting makes the organisation's own copy of it.</p>}
          {p.why && <p className="break-words text-micro text-text-secondary">Why: "{p.why}"</p>}
          {changed.length > 0 && <p className="break-words font-mono text-micro text-text-secondary" data-testid="skill-proposal-changes">{changed.join('  ')}</p>}
          {mode === 'edit' ? (
            <textarea aria-label="SKILL.md" value={edited} onChange={(e) => setEdited(e.target.value)} rows={12}
              className={`w-full rounded-lg p-2 font-mono text-micro ${FIELD}`} />
          ) : (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-2 p-2 text-micro text-text-secondary">{preview}</pre>
          )}
          {mode === 'view' && showAll && p.files.filter((f) => f.path !== 'SKILL.md').map((f) => (
            <div key={f.path} data-testid="skill-proposal-file">
              <p className="font-mono text-micro text-text-muted">{f.path}</p>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-2 p-2 text-micro text-text-secondary">{f.text ?? 'Not text: it is shown as a file on the skill\'s page.'}</pre>
            </div>
          ))}
          {mode === 'view' && (skillMd.split('\n').length > 8 || p.files.length > 1) && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className={`rounded text-micro font-medium text-link hover:underline ${FOCUS_RING}`}>{showAll ? 'Show less' : 'Show every file'}</button>
          )}
          <p className="text-micro text-text-muted" data-testid="skill-proposal-outcome">{outcomeText(p)}</p>
          {p.mayAim && (
            <label className="flex items-center gap-2 text-micro text-text-muted">
              Aim it at
              <NativeSelect size="sm" className="w-40" disabled={actions.busy} value={p.aim === 'ORGANISATION' ? 'organisation' : p.aim === 'PERSON' ? 'person' : 'project'}
                onChange={(e) => actions.onAim(e.target.value as SkillProposalView['aims'][number])}>
                {p.aims.map((a) => <option key={a} value={a}>{AIM_WORD[a]}</option>)}
              </NativeSelect>
            </label>
          )}
          {p.mayReview && mode === 'reject' && (
            <input aria-label="Why it isn't accepted" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why it isn't accepted"
              className={`w-full rounded-lg px-2 py-1 text-small ${FIELD}`} />
          )}
          {p.mayReview && (
            <div className="flex flex-wrap gap-2 pt-1">
              {mode === 'reject' ? (
                <>
                  <Button type="button" size="sm" variant="secondary" disabled={actions.busy} onClick={() => setMode('view')}>Back</Button>
                  <Button type="button" size="sm" disabled={actions.busy || !note.trim()} onClick={() => actions.onReject(note)}>Not accepted</Button>
                </>
              ) : (
                <>
                  <Button type="button" size="sm" variant="secondary" disabled={actions.busy} onClick={() => setMode('reject')}>Not accepted…</Button>
                  {mode === 'view'
                    ? <Button type="button" size="sm" variant="secondary" disabled={actions.busy} onClick={() => setMode('edit')}>Edit first</Button>
                    : <Button type="button" size="sm" variant="secondary" disabled={actions.busy} onClick={() => { setMode('view'); setEdited(skillMd) }}>Cancel edit</Button>}
                  <Button type="button" size="sm" disabled={actions.busy || !seenAll} title={seenAll ? undefined : 'Look at every file before accepting'} onClick={() => actions.onAccept(mode === 'edit' && edited !== skillMd ? edited : null, note)}>
                    {p.aim === 'PERSON' ? 'Add to my skills' : 'Accept'}
                  </Button>
                </>
              )}
            </div>
          )}
          <ShowAttention text={actions.error} title="The skill proposal was not answered" />
        </div>
      </div>
    </div>
  )
}

/**
 * A change an agent made to the person's own draft (D24): no agent sees it until it is published. Once the draft is
 * gone the card stops asking for a note: it says it was published (and by whom, when it was published from here) or
 * that it was discarded.
 */
export function SkillDraftCard({ name, shownRevision, draft, busy, error, onPublish, publishedHere = false, addHref }: {
  name: string
  shownRevision: number
  draft: SkillDraftCardView
  busy: boolean
  error: string | null
  onPublish: (note: string) => void
  /** This card's own Publish made the version now in use. */
  publishedHere?: boolean
  /** Where the published skill is given to agents, when that is a step the person takes. */
  addHref?: string
}) {
  const [note, setNote] = useState('')
  const [asking, setAsking] = useState(false)
  const gone = draft.revision === null
  const current = draft.revision === shownRevision
  const outcome = !gone ? null
    : publishedHere && draft.published ? `Published as ${draft.published} by you.`
    : draft.published ? `No draft now: it was published or discarded. In use: ${draft.published}.`
    : 'No draft now: it was discarded.'
  return (
    <div className="bg-surface-2 px-3 py-2" data-testid="skill-draft-card">
      <div className="flex items-start gap-2">
        <Sparkles size={14} aria-hidden className="mt-0.5 shrink-0 text-text-secondary" />
        <div className="min-w-0 flex-1 space-y-1 text-small">
          <p className="break-words font-medium text-text-primary">Draft of {draft.name}{draft.revision !== null && `, revision ${draft.revision}`}</p>
          <p className="text-micro text-text-muted" data-testid="skill-draft-state">
            {outcome ?? `Your draft of ${name}. No agent sees it until it's published.`}
          </p>
          {!gone && !current && <p className="text-micro text-text-muted">The draft has changed since this card; open it to see what is in it now.</p>}
          {asking && !gone && (
            <input aria-label="What changed" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed, for the history"
              className={`w-full rounded-lg px-2 py-1 text-small ${FIELD}`} />
          )}
          {!gone && (
            <div className="flex flex-wrap gap-2 pt-1">
              <a href={draft.openHref} className={PLAIN}>Open draft</a>
              {draft.mayPublish && current && (asking
                ? <Button type="button" size="sm" disabled={busy || !note.trim()} onClick={() => onPublish(note)}>Publish</Button>
                : <Button type="button" size="sm" disabled={busy} onClick={() => setAsking(true)}>Publish…</Button>)}
            </div>
          )}
          {gone && publishedHere && addHref && (
            <div className="flex flex-wrap gap-2 pt-1"><a href={addHref} className={MAIN}>Add to agents…</a></div>
          )}
          <ShowAttention text={error} title="The skill was not published" />
        </div>
      </div>
    </div>
  )
}
