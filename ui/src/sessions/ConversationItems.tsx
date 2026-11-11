import { Fragment, type ReactNode } from 'react'
import { approvalItems } from '@agenthix/core'
import { ApprovalCard, type ApprovalCardActions } from './ApprovalCard'
import type { RequestCardFailureAs } from './RequestCard'
import { ConversationUserMessage, ModelChangeMarker } from './ConversationMessages'
import { SummarisedMarker } from './MemoryBar'
import { ReplyBlock } from './ReplyBlock'
import type { WorkLineActions } from './WorkLineFold'
import type { ConversationItem } from './conversationModel'
import type { PendingManifestData, RenderMarkdown } from './types'

export type ConversationItemsProps = {
  items: ConversationItem[]
  sessionId: string
  agentName: string
  avatarUrl?: string | null
  renderMarkdown?: RenderMarkdown
  workActions: WorkLineActions
  /** The actions a view offers; where the person only reads, each is left out and its control is absent. */
  approvalActions?: ApprovalCardActions
  /** Without approval actions, who answers a request (a task's page: "Answer it in Now, above"). */
  approvalWaitingFor?: string
  /** Where a request card's failed answer is said: `thread` in a conversation; the dialog elsewhere (a task's page). */
  approvalFailureAs?: RequestCardFailureAs
  /** The run whose failure Try again would answer, while it is the latest reply. */
  latestFailureRunId: string | null
  agentWorking: boolean
  trying?: boolean
  onTryAgain?: () => void
  onSendNow?: (runId: string) => Promise<unknown>
  onCancelWaiting?: (runId: string) => Promise<unknown>
  onAnswered?: () => void
  /** Lines to draw around an item, by the item's key (a task's session marks where each run starts and ends). */
  around?: { before: Map<string, ReactNode>; after: Map<string, ReactNode> }
  /** What is happening now: shown after the running run's message, before any message waiting behind it. */
  live: ReactNode
  /** A request from a site that does not record approvals in the conversation: shown from the live event. */
  legacyApproval?: PendingManifestData | null
}

/** The conversation's items in reading order, with the live reply placed before the first waiting message. */
export function ConversationItems(p: ConversationItemsProps) {
  const waitingAt = p.items.findIndex(i => i.type === 'user' && i.waiting)
  const waitingApproval = p.items.some(i => i.type === 'approval' && i.entry.approvalCard?.answer === 'waiting')
  const legacy = p.legacyApproval && !waitingApproval && (
    <div className="pl-11">
    <ApprovalCard
      card={{ answer: 'waiting', items: approvalItems(p.legacyApproval.pendingManifest), decidedBy: null, decidedByYou: false, decidedAt: null, reason: null, allowedFor: 'this_run' }}
      agentName={p.agentName}
      runId={p.legacyApproval.runId}
      sessionId={p.sessionId}
      actions={p.approvalActions}
      waitingFor={p.approvalWaitingFor}
      failureAs={p.approvalFailureAs}
      onAnswered={p.onAnswered}
    />
    </div>
  )
  const tail = <>{p.live}{legacy}</>
  return (
    <>
      {p.items.map((item, i) => (
        <Fragment key={item.key}>
          {i === waitingAt && tail}
          {p.around?.before.get(item.key)}
          {renderItem(item, p)}
          {p.around?.after.get(item.key)}
        </Fragment>
      ))}
      {waitingAt < 0 && tail}
    </>
  )
}

function renderItem(item: ConversationItem, p: ConversationItemsProps): ReactNode {
  switch (item.type) {
    case 'user':
      return (
        <ConversationUserMessage
          content={item.entry.content}
          author={item.entry.authorName}
          createdAt={item.entry.createdAt}
          runId={item.entry.runId}
          waiting={item.waiting}
          onSendNow={p.onSendNow}
          onCancel={p.onCancelWaiting}
        />
      )
    case 'reply':
      return (
        <ReplyBlock
          item={item}
          agentName={p.agentName}
          avatarUrl={p.avatarUrl}
          renderMarkdown={p.renderMarkdown}
          actions={p.workActions}
          latestFailure={!!item.runId && item.runId === p.latestFailureRunId}
          running={p.agentWorking}
          trying={!!p.trying}
          onTryAgain={p.onTryAgain}
        />
      )
    case 'approval':
      return item.entry.approvalCard ? (
        <div className="pl-11">
        <ApprovalCard
          card={item.entry.approvalCard}
          agentName={p.agentName}
          runId={item.entry.runId ?? null}
          sessionId={p.sessionId}
          actions={p.approvalActions}
          waitingFor={p.approvalWaitingFor}
          failureAs={p.approvalFailureAs}
          onAnswered={p.onAnswered}
          onOpenRun={p.workActions.onOpenRun}
        />
        </div>
      ) : null
    case 'summarised':
      return <SummarisedMarker entry={item.entry} />
    case 'model':
      return <ModelChangeMarker model={item.model} at={item.at} />
  }
}
