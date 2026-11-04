/**
 * Dispatch + control channel handlers — plan 5d-2 task 8. This is where
 * `run.dispatch` genuinely runs an agent on site for the first time; the
 * cutover (plan 5d-2 task 9) is what makes hq actually SEND one. Same
 * zod-at-the-boundary convention as `runtimeChannelMethods.ts` (task 4):
 * params arrive as `unknown` off the wire from hq, every handler here
 * validates its own shape before delegating — schemas live in
 * `dispatchParams.ts` (file-size split).
 *
 * `run.dispatch`'s `context` field (core's
 * `RunContextPayload`) is validated at the top-level shape hq actually
 * constructs (agent config, chat/task sub-object, mounts) but not
 * exhaustively down to every nested scalar — the same trust boundary
 * `SessionSeed.metadata` already gets elsewhere in this module family
 * (`z.record(z.unknown())`, no deeper validation): hq is the sole caller,
 * builds this object from its own typed `RunContextPayload` construction
 * (dispatchService.ts), and the wire types are shared from `@agenthix/core`
 * on both ends.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { ZodError, type ZodType, type ZodTypeDef } from 'zod'
import { prisma } from '#db'
import {
  RUNTIME_METHODS,
  type RunDispatchPayload,
  type RunDispatchResult,
  type AgentPromptPreviewResult,
  type RunPackages,
} from '@agenthix/core'
import { agentEngine } from '../../agents/runtime/AgentEngine'
import { agentContainerManager } from '../../agents/runtime/AgentContainerManager'
import { getAgentDir, WorkspaceService } from '../../agents/agentDiskPaths'
import { AgentPromptBuilder } from '../../agents/AgentPromptBuilder'
import { resolveRunPackageDirs } from '../../packages/runPackages'
import { loadPromptContent } from '../../agents/promptContent'
import { upsertSessionFromSeed } from './sessionRows'
import { isNewestRun } from './nextRunApproval'
import { runChat } from './chatExecution'
import { runTask } from './taskExecution'
import { siteStream } from '../../agents/runtime/SiteStreamEmitter'
import { Logger } from '../utils/logger'
import {
  runDispatchParams,
  runIdParams,
  runApproveParams,
  runCancelParams,
  runRejectParams,
  agentStopParams,
  agentRemoveDirectoryParams,
  agentPromptPreviewParams,
} from './dispatchParams'

const logger = new Logger('DispatchHandler')

/** Same collapsing convention as runtimeChannelMethods.ts's parseParams — a raw
 *  ZodError's `.message` is an unreadable multi-issue blob in a `handler_failed`
 *  channel.error; collapse to the first issue's path + message on one line. */
function parseParams<T>(schema: ZodType<T, ZodTypeDef, unknown>, params: unknown, method: string): T {
  try {
    return schema.parse(params)
  } catch (err) {
    if (err instanceof ZodError) {
      const issue = err.issues[0]
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)'
      throw new Error(`${method}: ${path} — ${issue.message}`)
    }
    throw err
  }
}

// ── run.dispatch ─────────────────────────────────────────────────────────────

export async function handleRunDispatch(params: unknown): Promise<RunDispatchResult> {
  const payload = parseParams(runDispatchParams, params, RUNTIME_METHODS.runDispatch) as RunDispatchPayload

  // Idempotent — the seed's creation-time fields never change on re-dispatch
  // of the same session (sessionRows.ts's upsert: `update: {}`).
  await upsertSessionFromSeed(payload.session)

  let runId: string
  if (payload.kind === 'chat') runId = await runChat(payload)
  else runId = await runTask(payload)

  return { runId, sessionId: payload.session.id }
}

// ── run.cancel ───────────────────────────────────────────────────────────────

export async function handleRunCancel(params: unknown): Promise<{ ok: true }> {
  const { runId, reason, by } = parseParams(runCancelParams, params, RUNTIME_METHODS.runCancel)
  await agentEngine.cancelRun(runId, reason, by)
  return { ok: true }
}

// ── run.approve ─────────────────────────────────────────────────────────────

/**
 * manifestActions.approveManifest's site half (hq/src/agents/manifestActions.ts),
 * for a task's request and a conversation's alike: marks the request APPROVED
 * and nothing else. `pendingManifest` stays as it is, because hq then starts the
 * next run of the task or conversation, and that run — the next one only — is
 * given what was approved from it (nextRunApproval.ts).
 *
 * Only the newest run of its task or conversation may be approved: a request a
 * newer run has overtaken was replaced, whatever its row still says, and
 * approving it would hand its tools to a run nobody approved them for.
 *
 * Never throws on a missing, answered or overtaken run — `{ approved: false }`
 * instead, matching the delete family's own non-throwing shape (core's
 * runtimeData.ts doc comment): a duplicate or late approve call must not
 * surface as a wire error hq has to specially handle.
 */
export async function handleRunApprove(params: unknown): Promise<{ approved: boolean }> {
  const { runId, decidedBy } = parseParams(runApproveParams, params, RUNTIME_METHODS.runApprove)

  const run = await prisma.agentRun.findUnique({ where: { id: runId } })
  if (!run || run.manifestStatus !== 'PENDING_APPROVAL') return { approved: false }
  if (!(await isNewestRun(run))) return { approved: false }

  await prisma.agentRun.update({
    where: { id: runId },
    data: { manifestStatus: 'APPROVED', manifestDecidedAt: new Date(), ...(decidedBy ? { manifestDecidedById: decidedBy } : {}) },
  })
  return { approved: true }
}

// ── run.resume / run.reject ──────────────────────────────────────────────────

/**
 * manifestActions.rejectManifest's run-side half: manifest REJECTED write + a
 * `run.status` frame. The answer is the request's own state — who denied it,
 * when, and why (the run's error) — read with the request's row in the
 * transcript; nothing is written as a message of the person's. manifestActions DOES
 * write `status: 'CANCELLED'` to the run row (it does not leave status
 * untouched), so a CANCELLED status frame is sent, mirroring that write — its
 * own socket emits are hq-UI-only (`manifestRejected`), not a cross-boundary
 * status transition, which is why no such frame existed before this task.
 * The task branch's TaskComment + BLOCKED transition are hq-owned control-plane
 * writes and are recreated on hq's side at the cutover (plan 5d-2 task 9), not
 * here.
 *
 * `replaced: true` is not a person's answer: something newer in
 * the task or conversation replaced the request — Dismiss, or Run again before
 * its run starts. The request is marked SUPERSEDED and nothing else changes; the
 * run ended long ago. Safe to send twice, and a no-op on an answered request.
 */
export async function handleRunReject(params: unknown): Promise<{ ok: true }> {
  const { runId, reason, replaced, decidedBy } = parseParams(runRejectParams, params, RUNTIME_METHODS.runReject)

  if (replaced) {
    await prisma.agentRun.updateMany({
      where: { id: runId, manifestStatus: 'PENDING_APPROVAL' },
      data: { manifestStatus: 'SUPERSEDED', manifestDecidedAt: new Date() },
    })
    return { ok: true }
  }

  const run = await prisma.agentRun.findUnique({ where: { id: runId } })
  if (!run) throw new Error(`run.reject: run ${runId} not found`)
  if (run.manifestStatus !== 'PENDING_APPROVAL') {
    throw new Error(`run.reject: run ${runId} is not pending approval (status: ${run.manifestStatus})`)
  }
  const rejectReason = reason ?? 'Rejected'

  await prisma.agentRun.update({
    where: { id: runId },
    data: {
      status: 'CANCELLED', manifestStatus: 'REJECTED', error: rejectReason, endedAt: new Date(), manifestDecidedAt: new Date(),
      ...(decidedBy ? { manifestDecidedById: decidedBy } : {}),
    },
  })

  // Site has no Agent table (SC-338), and the stored dispatch blob no longer
  // carries agent config either (spec review, HIGH — {kind} only) — nothing
  // here can resolve a human-readable handle, so agentHandle is the bare
  // agentId, which every consumer of this field already tolerates as an
  // opaque string.
  siteStream.status({
    runId,
    sessionId: run.sessionId,
    taskId: run.taskId,
    agentId: run.agentId,
    agentHandle: run.agentId,
    status: 'CANCELLED',
    error: rejectReason,
    sessionPatch: null,
    manifestPending: null,
  })

  return { ok: true }
}

// ── agent.stop ───────────────────────────────────────────────────────────────

export async function handleAgentStop(params: unknown): Promise<{ ok: true }> {
  const { handle } = parseParams(agentStopParams, params, RUNTIME_METHODS.agentStop)
  await agentContainerManager.stopAgent(handle)
  return { ok: true }
}

// ── agent.removeDirectory ────────────────────────────────────────────────────

/**
 * Removes the agent's own directory on this site. Nothing is created under it
 * any more — a run's Claude home belongs to the storage boundary its container
 * serves — so what this clears is whatever an upgraded install still has
 * there: the per-person memory ADR-0058 superseded, and the credential home
 * that used to be seeded per agent. hq deletes the agent row and asks for
 * this; it never reaches this disk itself, and it never names a path.
 *
 * The path is derived HERE, from this site's own root and the handle hq named,
 * the same way every other site-side path is built. A handle stored before the
 * handle rule could still be `''`, `'..'` or `'a/b'`, each of which would
 * derive something other than one directory inside `agents/` — `agents/`
 * itself, the site root, a nested path — so the derived path has to be a direct
 * child of the agents root and is refused otherwise. That check is lexical, and
 * deliberately the only one: a symlink AT `agents/<handle>` passes it, but
 * `fs.rm` lstats, so it unlinks the link rather than walking into whatever it
 * points at — pinned by a test, since the handler leans on it.
 *
 * `removed: false` for an agent that never ran here is an answer, not a
 * failure: there is nothing on this site to remove for it.
 */
export async function handleAgentRemoveDirectory(params: unknown): Promise<{ removed: boolean }> {
  const { handle } = parseParams(agentRemoveDirectoryParams, params, RUNTIME_METHODS.agentRemoveDirectory)
  const root = path.resolve(WorkspaceService.getWorkspaceRoot())
  const dir = path.resolve(getAgentDir(handle))
  if (path.dirname(dir) !== root) {
    throw new Error(`Forbidden: handle ${JSON.stringify(handle)} names no single directory inside this site's agent root`)
  }
  let existed = true
  try {
    await fs.lstat(dir)
  } catch {
    existed = false
  }
  await fs.rm(dir, { recursive: true, force: true })
  logger.info(`[agent] removed ${handle}'s directory on this site (existed: ${existed})`)
  return { removed: existed }
}

// ── agent.promptPreview ──────────────────────────────────────────────────────

/** Assembles the preview exactly as a real run of that session type would, and
 *  returns the sections it was built from alongside the flattened prompt, so
 *  hq's preview can show them — editable ones editable. */
export async function handleAgentPromptPreview(params: unknown): Promise<AgentPromptPreviewResult> {
  const { agent, sessionType, packages } = parseParams(agentPromptPreviewParams, params, RUNTIME_METHODS.agentPromptPreview)
  const resolved = await resolveRunPackageDirs(packages as RunPackages)
  const builder = new AgentPromptBuilder(agent, await loadPromptContent(resolved))

  const sections = sessionType === 'chat'
    ? await builder.buildChatSections()
    : await builder.buildTaskSections()
  return { prompt: sections.map(s => s.content).filter(Boolean).join('\n\n---\n\n'), sections }
}
