/**
 * The work bar, apart from React: of a conversation's activity, the work that is live — queued, working, waiting
 * for the person's okay — with the requests first. Ended work has its card in the thread, and a task set for a
 * time is done once it is set: neither is in the bar.
 */
import type { OperationActivityView, OperationStateValue } from '../../shared/conversations/protocol'
import { OUTSTANDING_OPERATION_STATES } from '../../shared/conversations/work'

const LIVE: ReadonlySet<OperationStateValue> = new Set(OUTSTANDING_OPERATION_STATES)

export type WorkBarView = {
  /** Work waiting for the person's okay, oldest first. */
  requests: OperationActivityView[]
  /** The rest of the live work, in the order it started. */
  others: OperationActivityView[]
  /** Every live piece, requests included. */
  working: number
  needYou: number
}

const oldestFirst = (a: OperationActivityView, b: OperationActivityView) => a.createdAt.localeCompare(b.createdAt)

export function workBar(rows: OperationActivityView[]): WorkBarView {
  const live = rows.filter((r) => LIVE.has(r.state)).sort(oldestFirst)
  const requests = live.filter((r) => r.state === 'WAITING_FOR_APPROVAL')
  const others = live.filter((r) => r.state !== 'WAITING_FOR_APPROVAL')
  return { requests, others, working: live.length, needYou: requests.length }
}

/** The bar's one line: "4 working · 2 need you". */
export function barHeading(bar: Pick<WorkBarView, 'working' | 'needYou'>): string {
  const need = bar.needYou === 0 ? '' : ` · ${bar.needYou} ${bar.needYou === 1 ? 'needs' : 'need'} you`
  return `${bar.working} working${need}`
}
