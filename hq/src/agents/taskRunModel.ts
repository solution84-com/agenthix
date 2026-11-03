/**
 * The model a task's run takes, the runtime that can be given it, and the session it runs in.
 *
 * A task's run is work: whatever started it — a person's Run, a conversation, a schedule or the pulse — it takes the
 * model the resolver gives work in its boundary (runModel.ts): the agent's default worker model, else the
 * organisation's, on the runtime that model and its provider follow.
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
import type { OverrideBoundary } from './overrides/agentOverrideService'
import { chooseBoundaryRun, type RunChoice } from './runModel'
import { parseChoiceValue } from '../conversations/access/talkingModel'
import * as siteRuntimeStore from '../sessions/siteRuntimeStore'
import { takePausedMark } from '../sites/scheduled/runHold'
import { resolveSiteIdForTask } from './dispatchSiteResolution'
import { Logger } from '../server/utils/logger'

const logger = new Logger('DispatchService')

export type TaskRunChoice = RunChoice

/** `modelChoice` is the model the task names (a picker value), which the resolver takes as the pick. */
export function chooseTaskRun(
  boundary: OverrideBoundary, agent: Pick<Agent, 'id'>, personId: string | null = null, modelChoice: string | null = null,
): Promise<TaskRunChoice> {
  return chooseBoundaryRun(boundary, agent.id, personId, parseChoiceValue(modelChoice))
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
  await prisma.agentSession.deleteMany({ where: { taskId } })
}

/**
 * Readies the task's session for a run on `choice` before it is opened (dispatchService.ts's upsert): takes off the
 * mark of a run paused for a scheduled change, replaces a session on another runtime that nothing carries on in, and
 * gives a session it keeps on the run's runtime the run's model — the credential is resolved for the session's model.
 * Returns whether the last run had paused.
 */
export async function readyTaskSession(taskId: string, choice: TaskRunChoice): Promise<{ paused: boolean }> {
  const existing = await prisma.agentSession.findUnique({ where: { taskId } })
  if (!existing) return { paused: false }
  const { session, paused } = await takePausedMark(existing)
  const sessionRuntime = session.runtime ?? choice.runtime
  if (sessionRuntime !== choice.runtime) {
    const newestRun = paused ? null : await newestRunOf(taskId, session.id)
    if (!keepsTaskSession({ sessionRuntime, neededRuntime: choice.runtime, paused, newestRun })) {
      logger.info(`task ${taskId}'s session ${session.id} runs on ${sessionRuntime}; its run needs ${choice.runtime}, so it starts a new one`)
      await replaceTaskSession(taskId, session)
    }
    return { paused }
  }
  if (choice.model && session.model !== choice.model) await prisma.agentSession.update({ where: { id: session.id }, data: { model: choice.model } })
  return { paused }
}
