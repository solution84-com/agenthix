import { useContext } from 'react'
import { RequestCard, type RequestCardState } from '@agenthix/ui/sessions'
import type { RequestItem } from '../../hooks/threadBlocks'
import { AssetRequestDetails, useAssetRequestStale } from '../../../assets/pages/card/AssetRequestDetails'
import { mayAnswer, RequestsContext, type RequestsView } from './requestsContext'
import { askedArguments, requestHeading } from './requestWords'
import { specialRequest } from './SpecialRequests'

export const NO_LONGER_WAITING = 'No longer waiting for an answer'

function stateOf(item: RequestItem, waiting: boolean, view: RequestsView): RequestCardState | null {
  const { answer } = item
  if (answer) {
    const by = answer.authorId === view.myId ? null : view.people?.find((p) => p.id === answer.authorId)?.name ?? 'Someone'
    return { kind: 'answered', approved: answer.body.answer === 'approve', by, at: answer.createdAt, note: answer.body.note ?? null }
  }
  if (waiting) return { kind: 'waiting' }
  // Until the live work is read it is not known whether it still waits.
  return view.loaded ? { kind: 'ended', text: NO_LONGER_WAITING } : null
}

/**
 * A request for the person's okay, in the thread where it was asked (conversation spec, Approvals): the one request
 * card, with Approve and Deny for one who may answer; answered, the outcome in place. The server re-checks every
 * answer: the buttons only follow what it would allow.
 */
export function ThreadRequestCard({ item }: { item: RequestItem }) {
  const view = useContext(RequestsContext)
  const { message } = item
  const opId = message.operationId
  const stale = useAssetRequestStale(view && !item.answer ? opId : null)
  if (!view) return null
  const row = opId && !item.answer ? view.rows.find((r) => r.operationId === opId && r.state === 'WAITING_FOR_APPROVAL') : undefined
  const state = stateOf(item, !!row, view)
  const waiting = state === null || state.kind === 'waiting'
  const special = row ? specialRequest(row) : null
  const may = !!row && !!opId && mayAnswer(row, view.canAct)
  const onAnswer = (answer: 'approve' | 'decline', note?: string) => { if (opId) view.onAnswer(opId, answer, note) }
  const args = askedArguments(message.body)
  const reason = message.body.reason.trim()
  return (
    <div data-approval={opId ?? message.id} className="scroll-mt-4">
      <RequestCard
        heading={requestHeading(message.body, waiting)}
        state={state ?? { kind: 'waiting' }}
        testId="approval-card"
        waitingFor={row ? special?.waitingFor ?? 'Waiting for someone who can write here to answer' : undefined}
        controls={may && special?.controls ? special.controls(view.busy, onAnswer) : undefined}
        answer={may && !special?.controls ? {
          busy: view.busy,
          onApprove: () => onAnswer('approve'),
          onDeny: (note) => onAnswer('decline', note),
          ...(special?.answer ?? {}),
          ...(row?.kind === 'TOOL' && !special ? { scope: 'Only this, once' } : {}),
          ...(stale && !special ? { approveRefusal: { reason: stale, title: 'This request is out of date' } } : {}),
        } : undefined}
        footer={row && special?.after}
      >
        {special && row ? special.details : <>
          {args && <p className="break-words font-medium text-text-primary">{args}</p>}
          {reason && reason !== message.body.what && <p className="break-words">{reason}</p>}
          {message.body.boundaryName && <p className="text-micro text-text-muted">In {message.body.boundaryName}</p>}
        </>}
        {row && opId && !special && <AssetRequestDetails operationId={opId} />}
      </RequestCard>
    </div>
  )
}
