/**
 * The activity sheet's rows and their live lines (conversation layer spec, Conversation activity): what a row
 * says for each state, and the helpers a run hands work to, written as paths — "Shop · Profile the image
 * pipeline". Pure, so the order and the words are tested without a database; the forwarding of a run's frames
 * is in sites/channel/operationLinesForward.ts.
 */
import type { ContextUse } from '@agenthix/core'
import {
  activityWord,
  ENDED_OPERATION_STATES,
  type OperationActivityView,
  type OperationKindValue,
  type OperationStateValue,
} from '../../shared/conversations/protocol'

/** A run's helpers: the ones working now, by the call that handed them work, and how many have ended. */
export type LiveLines = { open: Array<{ id: string; text: string }>; ended: number }

export const noLiveLines = (): LiveLines => ({ open: [], ended: 0 })

/** A helper starts: its one-line description is the text. A call seen twice is one helper. */
export function helperStarted(live: LiveLines, id: string, text: string): LiveLines {
  if (live.open.some((h) => h.id === id)) return live
  return { ...live, open: [...live.open, { id, text: text.trim() || 'Working' }] }
}

/** A helper ends: it drops off the lines and the row counts it. A result for a call not open changes nothing. */
export function helperEnded(live: LiveLines, id: string): LiveLines {
  if (!live.open.some((h) => h.id === id)) return live
  return { open: live.open.filter((h) => h.id !== id), ended: live.ended + 1 }
}

/** One line per helper working now, as a path from the place the work is in. */
export function liveLinesOf(boundaryName: string | null, live: LiveLines): string[] {
  return live.open.map((h) => (boundaryName ? `${boundaryName} · ${h.text}` : h.text))
}

/** A task that has not started: where it waits, in words ("Shop · Developer · SHOP-214 — in Developer's queue"). */
export function taskWaitingLine(state: OperationStateValue, boundaryName: string | null, agentName: string, taskKey: string): string | null {
  const path = [boundaryName, agentName, taskKey].filter(Boolean).join(' · ')
  if (state === 'QUEUED' || state === 'ACCEPTED') return `${path} — in ${agentName}'s queue`
  if (state === 'WAITING_FOR_APPROVAL') return `${path} — waiting for approval`
  return null
}

/** What the sheet needs of one operation row; the caller fills the names a row does not hold. */
export type ActivityRow = {
  id: string
  kind: OperationKindValue
  state: OperationStateValue
  title: string
  boundaryName: string | null
  lines: string[]
  endedHelpers: number
  /** A worker's context use, while its work is under way. */
  contextUse?: ContextUse | null
  createdAt: Date
  /** Its latest request for the person's okay, read from the request's card. */
  request?: { what: string; reason: string; askedBy: string } | null
  runHref?: string | null
}

/** The run's address on the Runs screen, opened from this conversation; null before the work has a run. */
export function runHrefOf(run: { runId: string | null; sessionId: string | null }, conversationId: string): string | null {
  return run.runId && run.sessionId ? `/runs/${run.runId}?session=${run.sessionId}&conversation=${conversationId}` : null
}

const isEnded = (state: OperationStateValue) => (ENDED_OPERATION_STATES as readonly string[]).includes(state)

/** Outstanding operations first, then ended ones, each group newest first. */
export function orderActivity<T extends { state: OperationStateValue; createdAt: Date }>(rows: T[]): T[] {
  const byNewest = (a: T, b: T) => b.createdAt.getTime() - a.createdAt.getTime()
  return [...rows.filter((r) => !isEnded(r.state)).sort(byNewest), ...rows.filter((r) => isEnded(r.state)).sort(byNewest)]
}

export function toActivityView(row: ActivityRow, canStop: boolean): OperationActivityView {
  return {
    operationId: row.id,
    kind: row.kind,
    title: row.title,
    state: row.state,
    word: activityWord(row.state),
    boundaryName: row.boundaryName,
    // An ended operation has no live work: it shows once as completed, and its card holds the rest.
    lines: isEnded(row.state) ? [] : row.lines,
    endedHelpers: row.endedHelpers,
    contextUse: isEnded(row.state) ? null : row.contextUse ?? null,
    // Stop is for work still outstanding; an ended row has nothing to stop.
    canStop: canStop && !isEnded(row.state),
    createdAt: row.createdAt.toISOString(),
    request: row.state === 'WAITING_FOR_APPROVAL' ? row.request ?? null : null,
    runHref: row.runHref ?? null,
  }
}
