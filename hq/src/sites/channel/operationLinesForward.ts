/**
 * A run's work, forwarded to the conversation that commissioned it (conversation layer spec, Conversation
 * activity): when a worker's or a task's run hands work to a helper, the helper's description becomes a live line
 * of that operation's row in the sheet, and drops off when the helper ends. Frames of runs that are no
 * conversation's outstanding operation are ignored. The state is in memory only: live lines are of the moment,
 * and a restart starts them again from the next frame.
 */
import type { RunStatusEvent } from '@agenthix/core'
import { canonicalToolName, toolStep } from '@agenthix/core'
import { prisma } from 'wasp/server'
import { OUTSTANDING_OPERATION_STATES } from '../../shared/conversations/protocol'
import { conversationEvents, type ConversationEvents } from '../../conversations/coordinator/events'
import { boundaryName } from '../../conversations/coordinator/continuationChecks'
import { outstandingOperations } from '../../conversations/work/settle'
import { openText } from '../../conversations/sealing'
import {
  helperEnded, helperStarted, liveLinesOf, noLiveLines, type LiveLines,
} from '../../conversations/work/activityLines'

/** `waitLine`: why the run has not started, shown before its helpers' lines while it waits. */
type Tracked = { siteId: string; operationId: string; conversationId: string; boundary: string | null; live: LiveLines; waitLine?: string }

/** Runs being followed, by run id; and the same by operation, for the sheet's query. */
const byRun = new Map<string, Tracked>()
const byOperation = new Map<string, Tracked>()
/** Runs that are no operation's, so a later helper call does not ask the database again straight away. */
const notOurs = new Map<string, number>()
const NOT_OURS_FOR_MS = 5_000
/** Bounds `notOurs`, whose keys are run ids a site names; a status frame also clears its own. */
const NOT_OURS_CAP = 1_000
const notOursKey = (siteId: string, runId: string) => `${siteId}\u0000${runId}`

let events: ConversationEvents = conversationEvents
export function __setEventsForTests(next: ConversationEvents): void { events = next }
export function __resetForTests(): void {
  byRun.clear()
  byOperation.clear()
  notOurs.clear()
  events = conversationEvents
}

/** The live lines and the count of ended helpers of an operation, as the sheet shows them now. */
export function liveActivityOf(operationId: string): { lines: string[]; endedHelpers: number } {
  const tracked = byOperation.get(operationId)
  return tracked ? { lines: linesOf(tracked), endedHelpers: tracked.live.ended } : { lines: [], endedHelpers: 0 }
}

function linesOf(t: Tracked): string[] {
  const lines = liveLinesOf(t.boundary, t.live)
  return t.waitLine ? [t.waitLine, ...lines] : lines
}

async function followRun(siteId: string, runId: string): Promise<Tracked | null> {
  const held = byRun.get(runId)
  if (held) return held.siteId === siteId ? held : null
  const skipUntil = notOurs.get(notOursKey(siteId, runId))
  if (skipUntil && skipUntil > Date.now()) return null
  const op = await prisma.operation.findFirst({
    where: { siteId, runId, kind: { in: ['WORKER', 'TASK'] }, state: { in: [...OUTSTANDING_OPERATION_STATES] } },
    select: { id: true, conversationId: true, boundaryType: true, boundaryId: true },
  })
  if (!op) {
    rememberNotOurs(siteId, runId)
    return null
  }
  const tracked: Tracked = {
    siteId,
    operationId: op.id,
    conversationId: op.conversationId,
    boundary: op.boundaryType && op.boundaryId ? await boundaryName(op.boundaryType, op.boundaryId) : null,
    live: noLiveLines(),
  }
  byRun.set(runId, tracked)
  byOperation.set(op.id, tracked)
  return tracked
}

function rememberNotOurs(siteId: string, runId: string): void {
  const now = Date.now()
  if (notOurs.size >= NOT_OURS_CAP) {
    for (const [key, until] of notOurs) if (until <= now) notOurs.delete(key)
    if (notOurs.size >= NOT_OURS_CAP) notOurs.clear()
  }
  notOurs.set(notOursKey(siteId, runId), now + NOT_OURS_FOR_MS)
}

/** The run's lines, only for the site the run was dispatched to. */
function trackedFor(siteId: string, runId: string): Tracked | undefined {
  const tracked = byRun.get(runId)
  return tracked && tracked.siteId === siteId ? tracked : undefined
}

function emitLines(t: Tracked): void {
  events.operationLines({ conversationId: t.conversationId, operationId: t.operationId, lines: linesOf(t), endedHelpers: t.live.ended })
}

/** A run of an operation waits before it starts, or has stopped waiting (`null`): its row says why. */
export async function setRunWaitingLine(siteId: string, runId: string, line: string | null): Promise<void> {
  const tracked = line ? await followRun(siteId, runId) : trackedFor(siteId, runId)
  if (!tracked || (tracked.waitLine ?? null) === line) return
  if (line) tracked.waitLine = line
  else delete tracked.waitLine
  emitLines(tracked)
}

type ToolFrame = { name: string; runId: string; data: unknown }

/** A `run.stream` frame of a site's run: only a helper's start and end change a line. */
export async function forwardRunFrame(siteId: string, frame: ToolFrame): Promise<void> {
  if (frame.name !== 'agentToolCall' && frame.name !== 'agentToolResult') return
  const data = (frame.data ?? {}) as { toolUseId?: unknown; toolName?: unknown; toolInput?: unknown }
  if (typeof data.toolUseId !== 'string') return
  if (frame.name === 'agentToolCall') {
    if (typeof data.toolName !== 'string' || canonicalToolName(data.toolName) !== 'subagent') return
    const tracked = await followRun(siteId, frame.runId)
    if (!tracked) return
    tracked.live = helperStarted(tracked.live, data.toolUseId, toolStep(data.toolName, data.toolInput).text)
    emitLines(tracked)
    return
  }
  const tracked = trackedFor(siteId, frame.runId)
  if (!tracked) return
  const next = helperEnded(tracked.live, data.toolUseId)
  if (next === tracked.live) return
  tracked.live = next
  emitLines(tracked)
}

/**
 * A run starts: its operation is announced as running, so the indicator and sheet follow without a reload. A run
 * ends: its lines are forgotten (a worker's next run starts them again).
 */
export async function handleOperationRunStatus(e: RunStatusEvent, siteId: string): Promise<void> {
  if (e.status !== 'RUNNING') {
    const tracked = trackedFor(siteId, e.runId)
    if (tracked) {
      byRun.delete(e.runId)
      byOperation.delete(tracked.operationId)
    }
    notOurs.delete(notOursKey(siteId, e.runId))
    return
  }
  const op = await prisma.operation.findFirst({
    where: { siteId, runId: e.runId, state: { in: [...OUTSTANDING_OPERATION_STATES] } },
    select: { id: true, conversationId: true, title: true },
  })
  if (!op) return
  events.operation({
    conversationId: op.conversationId,
    operationId: op.id,
    state: 'RUNNING',
    title: openText(op.title),
    outstanding: await outstandingOperations(op.conversationId),
  })
}
