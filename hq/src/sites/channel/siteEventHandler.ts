import type { RunStatusEvent, RunStreamEvent, CredentialHealthEvent } from '@agenthix/core'
import { RUN_STREAM_EVENT_NAMES, RUN_STREAM_TARGET_ROOMS, SESSION_PATCH_EVENT, RUN_WAITING_EVENT, SITE_HEALTH_EVENT, SCHEDULED_CHANGE_EVENT, WORKFLOW_STEP_EVENT, WORKFLOW_RESULT_EVENT } from '@agenthix/core'
import { prisma } from 'wasp/server'
import { recordActivity } from '../../server/dashboard/activity'
import { triggerSnapshotPush } from '../../server/dashboard/debouncedPush'
import { Logger } from '../../server/utils/logger'
import { emitRunChanged } from '../../server/runEvents'
import { sessionOwnedBy, cachedSessionProjectFields, cachedSessionUserId, __resetSessionOwnerCacheForTests } from './sessionOwnerSite'
import { handleSubscriptionRefreshedEvent } from '../subscriptionGrants'
import { handleSessionPatch } from './sessionPatchEvent'
import { handleRunWaiting } from './runWaitingEvent'
import { handleSiteHealthEvent } from '../siteHealth'
import { handleScheduledChangeEvent } from '../scheduled/scheduledChanges'
import { isValidAgentHandle } from '../../agents/agentHandle'
import { applySiteTitle } from '../../sessions/siteSessionTitle'
import { projectIdOfSession, projectIdOfSessionRow } from '../../sessions/sessionProject'
import { forwardRunFrame } from './operationLinesForward'
import { clientRunEvent } from './clientRunEvents'
import { RUN_CLIENT_SOCKET, type RunStatusClientEvent } from '../../shared/conversations/runEvents'

const logger = new Logger('SiteEvents')

/**
 * Event names already warned about, per site: a site a minor ahead sends events
 * this hq does not know, and a warning on each arrival would fill the log. The
 * set is capped because the name comes off the wire.
 */
const warnedUnknownEvents = new Map<string, Set<string>>()
const MAX_WARNED_EVENT_NAMES = 50

function warnUnknownEventOnce(siteId: string, event: string): void {
  let warned = warnedUnknownEvents.get(siteId)
  if (!warned) warnedUnknownEvents.set(siteId, (warned = new Set()))
  if (warned.has(event) || warned.size >= MAX_WARNED_EVENT_NAMES) return
  warned.add(event)
  logger.warn(`unknown site.event '${event}' from ${siteId} — dropped (not logged again for this site)`)
}

/**
 * Task-machine reaction (plan 5d-2 task 9a — TaskRunner.ts registers itself
 * here at module scope). Keyed by name so a re-registration replaces rather
 * than doubles up, and so a failure log names who failed.
 *
 * `siteId` rides alongside the event (not embedded in `RunStatusEvent`
 * itself — the wire type is site's own report about ITS run, not about which
 * connection it arrived on): the task-machine listener needs it for its own
 * frame-ownership check (a status frame must come from the site that actually
 * owns the task it names — T9 binding c), which `handleStatus` is the only
 * place that still has, since `SiteConnection` never survives past this
 * function's own call frame.
 */
type StatusListener = (e: RunStatusEvent, siteId: string) => Promise<void>
const statusListeners = new Map<string, StatusListener>()
export function onRunStatus(name: string, l: StatusListener): void {
  statusListeners.set(name, l)
}

/**
 * Handlers of a site event a feature registers for itself at module scope, as TaskRunner registers its status
 * listener: so the feature's module, which reaches the channel itself, is never imported from here.
 */
type EventHandler = (siteId: string, data: unknown) => Promise<void>
const eventHandlers = new Map<string, EventHandler>()
export function onSiteEvent(event: string, handler: EventHandler): void {
  eventHandlers.set(event, handler)
}

/** Same name/shape as dashboard/activity.ts's __resetForTests — test-only reset. */
export function __resetForTests(): void {
  statusListeners.clear()
  terminalLatch.clear()
  warnedUnknownEvents.clear()
  __resetSessionOwnerCacheForTests()
}

/**
 * Intake for one-way `site.event` frames off the control channel — no
 * requestId, no reply (core's `SiteEventPayload`). `run.stream` re-emits
 * engine events into hq's socket.io rooms; `run.status` carries run lifecycle plus a session-copy patch.
 * `manifestPending` rides on the status frame too — carried through here
 * untouched; T9's listener is what consumes it, not this module. Task-frame
 * emits (`manifestPendingApproval`, `taskSessionStarted`) arrive as ordinary
 * `run.stream` frames named that way; what a client relies on is rebuilt as
 * hq's own declared event before it is sent on (clientRunEvents.ts).
 */
export async function handleSiteEvent(siteId: string, event: string, data: unknown): Promise<void> {
  if (event === 'run.stream') return handleStream(siteId, data)
  if (event === 'run.status') return handleStatus(siteId, data as RunStatusEvent)
  if (event === SESSION_PATCH_EVENT) return handleSessionPatch(siteId, data)
  if (event === RUN_WAITING_EVENT) return handleRunWaiting(siteId, data)
  if (event === 'site.subscriptionRefreshed') return handleSubscriptionRefreshedEvent(siteId, data)
  if (event === 'site.credentialHealth') return handleCredentialHealth(siteId, data as CredentialHealthEvent)
  if (event === SITE_HEALTH_EVENT) return handleSiteHealthEvent(siteId, data)
  if (event === SCHEDULED_CHANGE_EVENT) return handleScheduledChangeEvent(siteId, data)
  // Loaded when first needed: the workflow runs reach the channel themselves, and a static import would be a cycle.
  if (event === WORKFLOW_STEP_EVENT) return (await import('../../workflows/runsEvents')).handleWorkflowStepEvent(siteId, data)
  if (event === WORKFLOW_RESULT_EVENT) return (await import('../../workflows/runsEvents')).handleWorkflowResultEvent(siteId, data)
  const registered = eventHandlers.get(event)
  if (registered) return registered(siteId, data)
  warnUnknownEventOnce(siteId, event)
}

// hq synthesizes `agentRunStatus` itself, from a `run.status` frame
// (`handleStatus`'s `io.emit('agentRunStatus', ...)` below) — a site sending
// it as a `run.stream` frame too would double-deliver it to the browser (the
// rule the comment on that emit already states). Excluded here even though
// core's `RUN_STREAM_EVENT_NAMES` still lists it — that array is the full
// socket event vocabulary (mirrors what a browser may receive by any path),
// not the set a `run.stream` frame specifically may carry.
const RUN_STREAM_EVENT_NAME_SET: ReadonlySet<string> = new Set(
  RUN_STREAM_EVENT_NAMES.filter((name) => name !== 'agentRunStatus'),
)
const RUN_STREAM_TARGET_ROOM_SET: ReadonlySet<string> = new Set(RUN_STREAM_TARGET_ROOMS)

/**
 * Validates a `run.stream` frame's wire-controlled shape before it reaches a
 * socket.io room (SC-355) — until this, `handleStream` cast `data` straight
 * to `RunStreamEvent` and forwarded `e.name`/`e.data` verbatim into a browser
 * room with zero checks: the only unvalidated site→browser path on this
 * channel (`handleCredentialHealth`'s `validateCredentialHealthEvent` above
 * is the existing model this follows). `name` must be one of the known
 * `run.stream` event names (`RUN_STREAM_EVENT_NAMES` in core, minus
 * `agentRunStatus` — hq synthesizes that one itself; see
 * `RUN_STREAM_EVENT_NAME_SET`'s own comment above) — an unknown name would
 * let a compromised or buggy site fire an arbitrary event into a browser's
 * socket listener. `targetRoom` must be 'session' or 'task'; a
 * 'task' room additionally requires a non-empty `taskId`, since
 * `handleStream`'s room-selection falls back to the session room otherwise
 * and a malformed frame shouldn't silently pick a room for itself. `runId`
 * may be `null` — `taskSessionStarted` fires before the run row exists
 * (site/src/server/runtime/taskExecution.ts), by design, not a gap to close.
 *
 * Returns `null` (never throws) on anything invalid, matching this file's
 * existing best-effort posture for a malformed frame.
 */
function validateRunStreamFrame(e: unknown): RunStreamEvent | null {
  if (!e || typeof e !== 'object') return null
  const frame = e as Record<string, unknown>

  if (typeof frame.sessionId !== 'string' || frame.sessionId.length === 0) return null
  if (typeof frame.name !== 'string' || !RUN_STREAM_EVENT_NAME_SET.has(frame.name)) return null
  if (typeof frame.targetRoom !== 'string' || !RUN_STREAM_TARGET_ROOM_SET.has(frame.targetRoom)) return null
  if (frame.targetRoom === 'task' && (typeof frame.taskId !== 'string' || frame.taskId.length === 0)) return null
  if (frame.runId !== null && typeof frame.runId !== 'string') return null

  return e as RunStreamEvent
}

async function handleStream(siteId: string, data: unknown): Promise<void> {
  const e = validateRunStreamFrame(data)
  if (!e) {
    logger.warn(`site ${siteId}: rejected a malformed run.stream frame — dropped`)
    return
  }
  if (!(await sessionOwnedBy(e.sessionId, siteId))) return

  const out = clientRunEvent(e)
  if (!out) {
    logger.warn(`site ${siteId}: rejected a ${e.name} frame whose data does not fit hq's event — dropped`)
    return
  }

  const io = (globalThis as any).__wasp_io__
  // Defensive: a task frame missing its taskId falls back to the session
  // room rather than emitting into a malformed `task:null` room (mirrors
  // validateRunStreamFrame's own task/taskId check above, since a frame
  // that passed validation always has taskId set when targetRoom is 'task').
  const room = e.targetRoom === 'task' && e.taskId ? `task:${e.taskId}` : `session:${e.sessionId}`
  io?.to(room).emit(out.name, out.data)
  // A helper of a conversation's operation starting or ending moves a line of its sheet row; best effort.
  if (e.runId) {
    forwardRunFrame(siteId, { name: e.name, runId: e.runId, data: e.data })
      .catch((err) => logger.warn(`site ${siteId}: could not forward a run's work to its conversation: ${String(err)}`))
  }
}

/**
 * Picks only the fields site is allowed to write onto hq's session copy
 * (spec §10's one-writer rule, made structural rather than trusted): a raw
 * `data: e.sessionPatch` would hand an unvalidated network object straight to
 * Prisma on a model with an owner FK and live relations — a frame carrying
 * `{ userId: ... }` would reassign ownership, one carrying
 * `{ entries: { deleteMany: {} } }` would delete the transcript. Listing the
 * fields explicitly means a future widening of `RunStatusEvent['sessionPatch']`
 * in core fails to compile HERE until this picks the new field too, which is
 * the point — not a silent pass-through.
 *
 * The sending site is checked against the session's owner before this is
 * reached (handleStatus → sessionOwnedBy).
 */
function writableSessionFields(p: NonNullable<RunStatusEvent['sessionPatch']>) {
  const { title, status, closedReason, totalInputTokens, totalOutputTokens, totalCacheReadTokens, totalCacheWriteTokens } = p
  return { title, status, closedReason, totalInputTokens, totalOutputTokens, totalCacheReadTokens, totalCacheWriteTokens }
}

const TERMINAL_STATUSES = new Set<RunStatusEvent['status']>(['COMPLETED', 'FAILED', 'CANCELLED'])

/**
 * Terminal-frame latch:
 * once a terminal frame (COMPLETED/FAILED/CANCELLED) has been processed for
 * a runId, every SUBSEQUENT frame for that same runId — terminal or not —
 * skips every side effect below (the sessionPatch write, recordActivity/triggerSnapshotPush, the agentRunStatus socket
 * emit), but ALWAYS still runs the status listeners. Two real hazards
 * without this, not hypothetical ones:
 *
 *  1. deferredManifestReport.ts's SECOND terminal frame (site, plan 5d-2
 *     task 8): the engine's own terminal frame already ran every side
 *     effect once; the second frame exists ONLY to carry `manifestPending`
 *     to T9's listener. Without the latch it would run a double
 *     `recordActivity`/`triggerSnapshotPush` and a duplicate
 *     `agentRunStatus` emit in the browser.
 *  2. A stale reconcile frame arriving after the real terminal one (T6's
 *     reconciliation can interleave with a live frame on reconnect) — this
 *     discharges half of T9's own latch obligation (the comment this
 *     replaced said "guarding against that is T9's job"; it no longer is,
 *     for this specific hazard — T9 still owns serializing its OWN
 *     read-modify-write per taskId, a different problem).
 *
 * The latch is directional, not just a dedup — it protects "second frame
 * loses", not "whichever frame is correct wins". The mirror image of hazard
 * 2 is real and ACCEPTED, not fixed here: if a reconcile frame for a runId
 * lands and latches BEFORE the real live terminal frame arrives (rather than
 * after), the live frame is what gets skipped — including its sessionPatch,
 * which is where the run's final token totals ride onto hq's session-copy
 * mirror (spec D3). A reconcile frame is unlikely to carry those totals
 * itself (`run.list`'s row is reconstructed from site's `AgentRun`, not
 * replayed from the original `siteStream.status` call), so this ordering
 * can leave hq's mirror under-counted for that run. Confined to hq's own
 * display copy — site's row (the source of truth) is unaffected — so this is
 * accepted rather than fixed in this round.
 *
 * Listeners are exempt because they are the contractually idempotent
 * consumers (T9's task-machine listener) — the second frame's entire reason
 * to exist is delivering `manifestPending` to them; latching listeners too
 * would defeat deferredManifestReport.ts's own mechanism.
 *
 * Bounded: pruned on every insert, not by a timer (this fires on live
 * traffic, so pruning piggybacks on the moment growth happens rather than
 * needing its own interval). Age-pruned past `TERMINAL_LATCH_MAX_AGE_MS`,
 * then hard-capped at `TERMINAL_LATCH_HARD_CAP` oldest-first — Map iteration
 * order is insertion order, and `latchTerminal` no-ops on an already-present
 * key (never re-inserts), so that ordering genuinely stays oldest-first.
 *
 * Keyed per session (`latchKey`), not by runId alone: ownership is verified on
 * the frame's sessionId, so a runId-only key would let a site that owns some
 * other session latch — and so swallow — another site's run by naming its runId.
 */
export const TERMINAL_LATCH_MAX_AGE_MS = 6 * 60 * 60 * 1000
export const TERMINAL_LATCH_HARD_CAP = 10_000
const terminalLatch = new Map<string, { runId: string; processedAt: number }>()

function latchKey(sessionId: string, runId: string): string {
  return `${sessionId}:${runId}`
}

function latchTerminal(sessionId: string, runId: string): void {
  const key = latchKey(sessionId, runId)
  if (terminalLatch.has(key)) return
  const now = Date.now()
  terminalLatch.set(key, { runId, processedAt: now })
  for (const [id, entry] of terminalLatch) {
    if (now - entry.processedAt > TERMINAL_LATCH_MAX_AGE_MS) terminalLatch.delete(id)
  }
  if (terminalLatch.size > TERMINAL_LATCH_HARD_CAP) {
    let excess = terminalLatch.size - TERMINAL_LATCH_HARD_CAP
    for (const id of terminalLatch.keys()) {
      if (excess <= 0) break
      terminalLatch.delete(id)
      excess--
    }
  }
}

// The entry carries the session's project so the feed can hide it from someone
// not on that project. If the project cannot be resolved the entry is skipped:
// an entry recorded without one is shown to everybody, so guessing would leak.
async function recordRunCompleted(e: RunStatusEvent): Promise<void> {
  try {
    // From the ownership lookup's own row; a read only if that cache entry is gone.
    const fields = cachedSessionProjectFields(e.sessionId)
    const projectId = fields ? await projectIdOfSessionRow(fields) : await projectIdOfSession(e.sessionId)
    recordActivity('run_completed', `@${e.agentHandle} completed run`, e.runId, projectId)
  } catch (err) {
    logger.warn(`run_completed not recorded for run ${e.runId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function handleStatus(siteId: string, e: RunStatusEvent): Promise<void> {
  // Ownership first, BEFORE the latch is read: a frame from a site that does
  // not own this session applies nothing and must not latch the run, or a
  // foreign terminal frame could swallow the owner's real one. Concurrent
  // frames await the same cached lookup and resume in arrival order, so the
  // "no await between latch read and latch write" rule below still holds.
  const owned = await sessionOwnedBy(e.sessionId, siteId)
  const isTerminal = TERMINAL_STATUSES.has(e.status)
  const alreadyLatched = terminalLatch.has(latchKey(e.sessionId, e.runId))

  if (owned && !alreadyLatched) {
    // Latch before any `await` below (JS is single-threaded — a concurrent
    // frame for this runId only gets scheduled once this function yields, so
    // by then the latch is already set; the race window is not a lock, it's
    // "nothing awaits between here and the latch write").
    if (isTerminal) latchTerminal(e.sessionId, e.runId)

    if (e.sessionPatch) {
      const { title, ...copyFields } = writableSessionFields(e.sessionPatch)
      const warnFailed = (err: unknown) =>
        logger.warn(
          `session copy patch failed for session ${e.sessionId} (run ${e.runId}): ${err instanceof Error ? err.message : String(err)}`,
        )
      if (Object.values(copyFields).some((v) => v !== undefined)) {
        await prisma.agentSession
          .update({ where: { id: e.sessionId }, data: copyFields })
          .catch(warnFailed)
      }
      // The title is written apart from the rest so it can be a compare-and-set
      // (applySiteTitle): a frame carrying a stale title must never overwrite a
      // rename the person made while it was in flight.
      if (typeof title === 'string' && title.length > 0) await applySiteTitle(e.sessionId, title).catch(warnFailed)
    }
    if (e.status === 'COMPLETED') {
      await recordRunCompleted(e)
      triggerSnapshotPush()
    }
    const io = (globalThis as any).__wasp_io__
    // Synthesized here from the status frame — a site must not also send this
    // as a run.stream frame, or the browser sees it twice.
    const runStatus: RunStatusClientEvent = { runId: e.runId, status: e.status, error: e.error ?? undefined }
    io?.to(`session:${e.sessionId}`).emit(RUN_CLIENT_SOCKET.runStatus, runStatus)
    void emitRunChanged(e.sessionId, e.runId, e.status, cachedSessionUserId(e.sessionId))
  }
  // else: unowned or already latched — every side effect above is skipped for this frame.

  // Listener order is meaningful only within this one frame; nothing here
  // serializes across frames — frame B starts as soon as frame A reaches its
  // first await, not after frame A's listeners finish. If T9's listener does
  // a read-modify-write keyed by taskId, it must serialize that itself.
  for (const [name, l] of statusListeners) {
    try {
      await l(e, siteId)
    } catch (err) {
      logger.error(`status listener '${name}' failed for run ${e.runId} (${e.status})`, err)
    }
  }
}

/**
 * Notification type for a person's own Claude login that has expired (SC-349) —
 * distinct from every other type in the table.
 */
const CREDENTIAL_HEALTH_NOTIFICATION_TYPE = 'credential_health'

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

const CREDENTIAL_HEALTH_DETAIL_MAX_LENGTH = 500

/**
 * Validates the wire-controlled fields of a `site.credentialHealth` event
 * before ANY of them reach a Notification row or a log line (finding 5,
 * quality review). `handleSiteEvent`'s `data as CredentialHealthEvent` cast
 * (this file, `handleSiteEvent`) is a TypeScript assertion, not a runtime
 * check — nothing upstream verifies a connected site actually sent
 * well-formed fields, and a site is exactly the kind of caller `writableSessionFields`
 * above already treats as untrusted network input for a sibling event type.
 *
 * `state` must be exactly one of the two known values — an arbitrary string
 * would ride straight into the Notification `title`/`body`, unbounded.
 * `agentHandle` is what BOTH throttles key on: the per-(handle, state)
 * throttle in `agentCredentials.ts` (site-side) and the per-(site, handle,
 * state)-per-day dedup read below (`title` embeds it) — a site that varies
 * the handle on every event bypasses both into unbounded per-admin
 * Notification rows, so it's checked against the shared handle rule
 * (`isValidAgentHandle`, agents/agentHandle.ts) that every hq-produced handle satisfies.
 * `detail` is free text and is TRUNCATED rather than rejected — losing
 * detail past 500 chars is harmless where a malformed state or handle is not.
 *
 * Returns `null` (never throws) on anything invalid — the caller logs and
 * drops the event, matching this handler's existing best-effort posture for
 * a malformed frame (see the `unknown site.event` branch in `handleSiteEvent`).
 */
function validateCredentialHealthEvent(
  e: CredentialHealthEvent,
): { agentHandle: string; state: CredentialHealthEvent['state']; detail: string } | null {
  if (e?.state !== 'missing' && e?.state !== 'expired') return null
  if (!isValidAgentHandle(e.agentHandle)) return null
  const detail = typeof e.detail === 'string' ? e.detail.slice(0, CREDENTIAL_HEALTH_DETAIL_MAX_LENGTH) : ''
  return { agentHandle: e.agentHandle, state: e.state, detail }
}

/**
 * A site's `site.credentialHealth` event (SC-349): a run found its Claude login missing or expired. A provider's key
 * is no longer a site's to report — its health is the provider's, moved by `providers/health.ts` and told to
 * organisation admins (models from one place, part 1). The only Claude login a run is handed now is a person's own
 * subscription, so the event is the cue to tell each person whose own login has expired, in hq's own record, and
 * nobody else; once a day each, deduped by a DB read so a restart does not tell them again.
 */
async function handleCredentialHealth(siteId: string, e: CredentialHealthEvent): Promise<void> {
  const validated = validateCredentialHealthEvent(e)
  if (!validated) {
    logger.warn(`site ${siteId}: rejected a malformed site.credentialHealth event — dropped`)
    return
  }
  const { agentHandle, state, detail } = validated
  logger.warn(`site ${siteId}: credential ${state} for agent ${agentHandle} — ${detail}`)

  const expired = await prisma.aiProvider.findMany({
    where: { credentialKind: 'subscription', ownerUserId: { not: null }, expiresAt: { lt: new Date() } },
    select: { ownerUserId: true },
  })
  const title = 'Your Claude subscription needs signing in again'
  const body = 'Its login has expired, so work in your own place cannot use it. Sign in again under Settings.'
  await Promise.all(expired.map(async ({ ownerUserId }) => {
    const userId = ownerUserId!
    const told = await prisma.notification.findFirst({
      where: { userId, type: CREDENTIAL_HEALTH_NOTIFICATION_TYPE, createdAt: { gte: startOfToday() } }, select: { id: true },
    })
    if (told) return
    await prisma.notification
      .create({ data: { userId, type: CREDENTIAL_HEALTH_NOTIFICATION_TYPE, title, body, actionLabel: 'Sign in again', actionUrl: '/settings' } })
      .catch((err: unknown) => logger.error(`failed to tell ${userId} their Claude subscription expired`, err))
  }))
}
