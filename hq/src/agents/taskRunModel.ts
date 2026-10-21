/**
 * The model a task's run takes, the runtime that can be given it, and the session it runs in.
 *
 * A task's run is light work: whatever started it — a person's Run, a conversation, a schedule or the pulse — it
 * takes its boundary's light-work model from the effective policy, on the agent's runtime when it offers that model,
 * else on OpenCode (`workChoice`), as a conversation's worker does. A boundary's override of the agent's model only
 * narrows (agentOverrideService.ts), so where one applies the run keeps it.
 *
 * A session keeps the runtime it began on (adr-0078), and a task has one session (`AgentSession.taskId` is unique on
 * hq and on the site). So a run that needs another runtime than the task's session has replaces that session, as a
 * person's Clear does (clearTaskSession.ts) — unless something in it carries on: a run paused for a scheduled change,
 * a run still going, or the run an approval was given for, which is given what was approved in the session that asked.
 * Those stay where they are, on the session's runtime and model.
 */
import { prisma } from 'wasp/server'
import type { Agent, AgentSession } from '@prisma/client'
import type { RunRow } from '@agenthix/core'
import type { EffectiveModelPolicy } from '../conversations/contract'
import { resolveModelPolicy } from '../model-policy/modelPolicyService'
import { workChoice } from '../model-policy/workChoice'
import { getAgentOverride, modelOverrideRefusal, type OverrideBoundary, type PackageModel } from './overrides/agentOverrideService'
import * as siteRuntimeStore from '../sessions/siteRuntimeStore'
import { expirePreviewsForSessions } from '../preview/previewRegistry'
import { takePausedMark } from '../sites/scheduled/runHold'
import { resolveSiteIdForTask } from './dispatchSiteResolution'
import { Logger } from '../server/utils/logger'

const logger = new Logger('DispatchService')

export type TaskRunChoice = { model: string; runtime: string }

export function taskRunChoice(policy: EffectiveModelPolicy, agent: PackageModel, overrideModel: string | null): TaskRunChoice {
  if (overrideModel && modelOverrideRefusal(agent, overrideModel) === null) return { model: overrideModel, runtime: agent.runtime }
  const choice = workChoice(policy, 'light', agent.runtime)
  return { model: choice.model ?? agent.defaultModel, runtime: choice.runtime }
}

export async function chooseTaskRun(boundary: OverrideBoundary, agent: Agent): Promise<TaskRunChoice> {
  const [override, policy] = await Promise.all([getAgentOverride(boundary, agent.id), resolveModelPolicy(boundary, agent)])
  return taskRunChoice(policy, agent, override?.model ?? null)
}

type NewestRun = Pick<RunRow, 'status' | 'manifestStatus' | 'pendingManifest'> | null

/** A request was approved on the run: the site marks every ordinary run APPROVED too, with nothing asked. */
function approvedRequest(run: NonNullable<NewestRun>): boolean {
  if (run.manifestStatus !== 'APPROVED') return false
  const asked = run.pendingManifest as { tools?: unknown[]; bashPatterns?: unknown[] } | null
  return (asked?.tools?.length ?? 0) + (asked?.bashPatterns?.length ?? 0) > 0
}

export function keepsTaskSession(input: { sessionRuntime: string; neededRuntime: string; paused: boolean; newestRun: NewestRun }): boolean {
  if (input.sessionRuntime === input.neededRuntime || input.paused) return true
  const run = input.newestRun
  return !!run && (run.status === 'PENDING' || run.status === 'RUNNING' || approvedRequest(run))
}

async function newestRunOf(taskId: string, sessionId: string): Promise<NewestRun> {
  const [run] = await siteRuntimeStore.listRuns(await resolveSiteIdForTask(taskId), { sessionId, limit: 1 })
  return run ?? null
}

/** Removes the task's session, the site's first, as a person's Clear does. */
async function replaceTaskSession(taskId: string, session: AgentSession): Promise<void> {
  await siteRuntimeStore.deleteSessionsBy(await resolveSiteIdForTask(taskId), { taskId })
  await expirePreviewsForSessions([session.id])
  await prisma.agentSession.deleteMany({ where: { taskId } })
}

/**
 * Readies the task's session for a run on `choice` before it is opened (dispatchService.ts's upsert): takes off the
 * mark of a run paused for a scheduled change, replaces a session on another runtime that nothing carries on in, and
 * gives a session it keeps on the run's runtime the run's model — the credential is resolved for the session's model.
 * Returns whether the last run had paused.
 */
export async function readyTaskSession(taskId: string, agent: Agent, choice: TaskRunChoice): Promise<{ paused: boolean }> {
  const existing = await prisma.agentSession.findUnique({ where: { taskId } })
  if (!existing) return { paused: false }
  const { session, paused } = await takePausedMark(existing)
  const sessionRuntime = session.runtime ?? agent.runtime
  if (sessionRuntime !== choice.runtime) {
    const newestRun = paused ? null : await newestRunOf(taskId, session.id)
    if (!keepsTaskSession({ sessionRuntime, neededRuntime: choice.runtime, paused, newestRun })) {
      logger.info(`task ${taskId}'s session ${session.id} runs on ${sessionRuntime}; its run needs ${choice.runtime}, so it starts a new one`)
      await replaceTaskSession(taskId, session)
    }
    return { paused }
  }
  if (session.model !== choice.model) await prisma.agentSession.update({ where: { id: session.id }, data: { model: choice.model } })
  return { paused }
}
