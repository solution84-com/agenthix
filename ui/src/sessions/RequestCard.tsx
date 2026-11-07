import { useState, type ReactNode } from 'react'
import { formatTime } from './SessionComponents'
import { Button } from '../primitives/Button'

/** How a request stands: still waiting, answered (by the viewer when `by` is null), or no longer waiting. */
export type RequestCardState =
  | { kind: 'waiting' }
  | { kind: 'answered'; approved: boolean; by: string | null; at: string | null; note?: string | null }
  | { kind: 'ended'; text: string }

/** The answer the viewer may give. Absent: they only read, and `waitingFor` says who answers. */
export type RequestCardAnswer = {
  onApprove: () => void
  onDeny: (note: string | undefined) => void
  busy?: boolean
  approveLabel?: string
  denyLabel?: string
  /** Deny asks for an optional reason first. */
  askWhy?: boolean
  /** What Approve allows, beside the buttons: "Only this, once". */
  scope?: string
}

/** "You approved it · 18:31", "Sam denied it · 18:32", or the request's end in words. */
export function requestOutcome(state: Exclude<RequestCardState, { kind: 'waiting' }>): string {
  if (state.kind === 'ended') return state.text
  const verb = state.approved ? 'approved' : 'denied'
  const at = state.at ? ` · ${formatTime(state.at)}` : ''
  return `${state.by ?? 'You'} ${verb} it${at}`
}


function Answer({ answer }: { answer: RequestCardAnswer }) {
  const [denying, setDenying] = useState(false)
  const [note, setNote] = useState('')
  const deny = answer.denyLabel ?? 'Deny'
  if (denying) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') answer.onDeny(note.trim() || undefined)
            if (e.key === 'Escape') { setDenying(false); setNote('') }
          }}
          placeholder="Say why, if you like"
          aria-label="Why you deny it"
          disabled={answer.busy}
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface-1 px-2.5 text-small max-sm:h-11 text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        <Button variant="secondary" disabled={answer.busy} onClick={() => answer.onDeny(note.trim() || undefined)}>{deny}</Button>
        <Button variant="secondary" disabled={answer.busy} onClick={() => { setDenying(false); setNote('') }}>Cancel</Button>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button disabled={answer.busy} onClick={answer.onApprove}>{answer.approveLabel ?? 'Approve'}</Button>
      <Button variant="secondary" disabled={answer.busy} onClick={() => (answer.askWhy === false ? answer.onDeny(undefined) : setDenying(true))}>
        {deny}
      </Button>
      {answer.scope && <span className="text-micro text-text-muted">{answer.scope}</span>}
    </div>
  )
}

/**
 * A request for the person's okay, the one card wherever it is answered (a conversation, a task's page, its session):
 * what is asked in plain words, then Approve and Deny; once answered the buttons go and it says the outcome in place.
 * `heading` is the whole first line ("Writer asks to make a team"); `children` are its detail lines.
 */
export function RequestCard({ heading, children, state, answer, controls, waitingFor, error, footer, testId = 'request-card' }: {
  heading: string
  children?: ReactNode
  state: RequestCardState
  answer?: RequestCardAnswer
  /** In place of Approve and Deny, for a request answered its own way (a workflow's review). */
  controls?: ReactNode
  /** Shown while it waits to someone who may not answer: who will. */
  waitingFor?: string
  error?: string | null
  /** A last line under the outcome, such as where the run opens. */
  footer?: ReactNode
  testId?: string
}) {
  const waiting = state.kind === 'waiting'
  return (
    <div
      role="group"
      aria-label={heading}
      data-testid={testId}
      data-state={state.kind === 'answered' ? (state.approved ? 'approved' : 'denied') : state.kind}
      className={`space-y-2 rounded-xl border p-3 ${waiting ? 'border-warning/40 bg-warning/5' : 'border-border bg-surface-1'}`}
    >
      <p className="break-words text-small font-semibold text-text-primary">{heading}</p>
      {children && <div className="space-y-1 text-small text-text-secondary">{children}</div>}
      {error && <p role="alert" className="text-small text-danger">{error}</p>}
      {waiting ? (
        controls ?? (answer ? <Answer answer={answer} /> : waitingFor ? <p className="text-micro text-text-muted">{waitingFor}</p> : null)
      ) : (
        <p className={`text-small font-medium ${state.kind === 'answered' && state.approved ? 'text-success' : 'text-text-secondary'}`} data-testid="request-outcome">
          {state.kind === 'answered' ? (state.approved ? '✓ ' : '✕ ') : ''}{requestOutcome(state)}
          {state.kind === 'answered' && state.note && <span className="font-normal text-text-muted"> · “{state.note}”</span>}
        </p>
      )}
      {footer}
    </div>
  )
}
