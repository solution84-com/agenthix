/**
 * A conversation's record as the screen reads it (every screen reviewed, *What
 * a conversation shows*): the site's rows in reading order, run by run, with
 * what hq alone can add — who answered an approval and who asked for a
 * summary, by name, and "you" for the viewer — and the facts the header's
 * popup shows: how many replies, how many failed, the failure Try again would
 * answer, and the agent's memory as the runtime last reported it.
 */
import {
  approvalAnswer,
  approvalItems,
  latestFailure,
  orderTranscript,
  replyCounts,
  type ApprovalCard,
  type ContextSummarisedDetail,
  type ContextUse,
  type ConversationFacts,
  type LatestFailure,
  type TranscriptRow,
} from '@agenthix/core'
import { usernames } from '../projects/onBehalfOfOperations'
import { UNKNOWN_AUTHOR } from './transcriptAuthors'

/** Declared in core's client protocol, since a task's session carries them to the mobile app. */
export type { ApprovalCard, ConversationFacts } from '@agenthix/core'

type Row = Pick<TranscriptRow, 'role' | 'content' | 'createdAt'> & Partial<Pick<TranscriptRow, 'runId' | 'kind' | 'detail' | 'approval' | 'runStatus'>>

export type ConversationRow<T> = T & {
  /** On an approval request: the request and its answer in plain words. */
  approvalCard?: ApprovalCard | null
  /** On a summary marker: who asked for it, by name, and whether it was the viewer ("You summarised…"). */
  summarisedBy?: string | null
  summarisedByYou?: boolean
}

/** The ids of people the record names, other than the viewer. */
export function namedPeople(entries: Row[], viewerId: string): string[] {
  const ids = entries.flatMap(e => [
    e.approval?.decidedById ?? null,
    e.kind === 'CONTEXT_SUMMARISED' ? (e.detail as ContextSummarisedDetail | null)?.byId ?? null : null,
  ])
  return [...new Set(ids.filter((id): id is string => !!id && id !== viewerId))]
}

/** The record in reading order, with names put to what people did. Pure: `names` are the people `namedPeople` listed. */
export function conversationRows<T extends Row>(entries: T[], viewerId: string, names: Map<string, string>): ConversationRow<T>[] {
  const nameOf = (id: string | null | undefined) => (id && id !== viewerId ? names.get(id) ?? UNKNOWN_AUTHOR : null)
  return orderTranscript(entries).map(e => {
    if (e.kind === 'APPROVAL_REQUESTED' && e.approval) {
      const { approval } = e
      const card: ApprovalCard = {
        answer: approvalAnswer(approval.status),
        items: approvalItems(approval.request),
        decidedBy: nameOf(approval.decidedById),
        decidedByYou: !!approval.decidedById && approval.decidedById === viewerId,
        decidedAt: approval.decidedAt,
        reason: approval.reason,
        allowedFor: 'this_run',
      }
      return { ...e, approvalCard: card }
    }
    if (e.kind === 'CONTEXT_SUMMARISED') {
      const byId = (e.detail as ContextSummarisedDetail | null)?.byId ?? null
      return { ...e, summarisedBy: nameOf(byId), summarisedByYou: byId === viewerId }
    }
    return e
  })
}

export async function withConversationRecord<T extends Row>(
  entries: T[],
  viewerId: string,
  contextUse: ContextUse | null,
): Promise<{ entries: ConversationRow<T>[]; conversation: ConversationFacts }> {
  const people = namedPeople(entries, viewerId)
  const names = people.length > 0 ? await usernames(people) : new Map<string, string>()
  const rows = conversationRows(entries, viewerId, names)
  return { entries: rows, conversation: { ...replyCounts(rows), latestFailure: latestFailure(rows), contextUse } }
}

/** What the run Try again starts is sent: the same message, with a note the agent alone sees. */
export function tryAgainPrompt(failure: LatestFailure): string {
  const reason = failure.reason ? ` ${failure.reason}` : ''
  return `[Your last reply to this message did not finish.${reason} The person asked you to try again.]\n\n${failure.message}`
}
