/**
 * Task execution — plan 5d-2 task 8. The site half of hq's `TaskRunner.execute`
 * (hq/src/agents/TaskRunner.ts, lines 235-362) — its execution core, MINUS
 * every `prisma.task` call and the session upsert: task state is hq's (the
 * RUN_QUEUED→RUN_ACTIVE claim, per-(agent,project) serialisation and
 * trigger-next all stay on hq — dispatchService.ts/TaskRunner.ts), and the
 * session arrives pre-seeded (dispatchHandler.ts's `upsertSessionFromSeed`
 * runs once, ahead of every kind, before this module is ever reached). Board
 * columns and the task key are pre-rendered by hq (`context.task`,
 * dispatchService.ts's `buildContext`). The roadmap path is not: hq names no
 * path on a site's disk, so it is resolved here from where this site mounts the
 * project's files (`resolveRunRoadmapPath`). Terminal reporting is by frames,
 * not local `Task` writes: a deferred manifest becomes `manifestPending` on
 * the terminal `run.status` frame (hq recreates the `__MANIFEST_APPROVAL__` comment and BLOCKED transition at the
 * cutover, plan 5d-2 task 9) instead of `createTaskComment` + `prisma.task.update`
 * here. Session-archive-on-terminal-task (TaskRunner.ts:393) likewise becomes
 * hq-driven at the cutover, since only hq knows the task reached a terminal state.
 */
import { prisma } from '#db'
import { defaultModelFor, pickedSkillOf, type RunDispatchPayload } from '@agenthix/core'
import type { TaskContext, DeferredManifest } from '../../agents/runtime/types'
import { agentEngine } from '../../agents/runtime/AgentEngine'
import { buildApprovedManifest } from '../../agents/runtime/manifestParser'
import { resolveRunRoadmapPath } from '../../agents/runtime/runRoadmap'
import { coerceToolPermissions, coerceBashPatternPermissions, mergeWithAlwaysInjected } from '../../agents/runtime/toolPermissions'
import { ALWAYS_INJECTED_MCP_TOOLS } from '../../shared/mcpTools'
import { runPackageColumns } from '../../packages/runPackages'
import { siteStream } from '../../agents/runtime/SiteStreamEmitter'
import { reportDeferredManifestIfAny } from './deferredManifestReport'
import { commentsSinceLastRun } from './taskComments'
import { approvalForNextRun, approvalNote, replaceUnansweredRequests } from './nextRunApproval'
import { Logger } from '../utils/logger'

const logger = new Logger('TaskExecution')

export async function runTask(payload: RunDispatchPayload): Promise<string> {
  const { session, context, capabilityJwt } = payload
  const agent = context.agent
  const task = context.task
  if (!task) throw new Error('runTask: dispatch payload for a task run carries no task context')

  // Notify the task room immediately so the client can subscribe to the session
  // without polling (TaskRunner.execute lines 235-237) — a pre-run stream frame,
  // no run id yet (RunStreamEvent.runId is nullable for exactly this case).
  siteStream.stream({
    sessionId: session.id,
    runId: null,
    taskId: task.taskId,
    targetRoom: 'task',
    name: 'taskSessionStarted',
    data: { sessionId: session.id },
  })

  const toolPermissions = mergeWithAlwaysInjected(coerceToolPermissions(agent.allowedTools))
  const bashPermissions = coerceBashPatternPermissions(agent.allowedBashPatterns)
  const baseTools = [
    ...new Set([
      ...toolPermissions.filter(p => p.state === 'always').map(p => p.name),
      ...ALWAYS_INJECTED_MCP_TOOLS,
    ]),
  ]
  const baseBashPatterns = bashPermissions.filter(p => p.state === 'always').map(p => p.pattern)

  const taskContext: TaskContext = {
    projectId: task.projectId,
    boardName: task.boardName,
    columns: task.columns,
    taskId: task.taskId,
    title: task.title,
    description: task.description,
    // The storage the run works in, as hq placed it on the session: a personal
    // project's task works in its person's own, never in a project's.
    roadmapPath: resolveRunRoadmapPath(
      session.primaryOwnerType && session.primaryOwnerId
        ? { ownerType: session.primaryOwnerType, ownerId: session.primaryOwnerId }
        : { ownerType: 'project', ownerId: task.projectId },
    ),
    newComments: await commentsSinceLastRun(task.taskId, agent.id, task.comments),
  }

  // ONLY the kind, what started the run and who it is for — see chatExecution.ts's dispatchBlob comment
  // (spec review, HIGH: no secret or provider key at rest).
  const dispatchBlob = {
    kind: 'task' as const,
    startedBy: payload.startedBy,
    runLimits: payload.runLimits,
    ...(payload.onBehalfOfUserId ? { onBehalfOfUserId: payload.onBehalfOfUserId } : {}),
  }

  // Read before the requests are replaced and before this run exists: the newest earlier run decides.
  const scope = { sessionId: session.id, taskId: task.taskId }
  const approved = agent.approval === 'bypassed' ? null : await approvalForNextRun(scope)
  await replaceUnansweredRequests(scope)

  if (agent.approval === 'bypassed') {
    const approvedManifest = buildApprovedManifest(
      { tools: baseTools, bashPatterns: baseBashPatterns },
      { extendedTools: [], extendedBashPatterns: [] },
    )
    const run = await prisma.agentRun.create({
      data: {
        ...runPackageColumns(context.packages, context),
        agentId: agent.id,
        sessionId: session.id,
        status: 'PENDING',
        inputText: payload.inputText,
        model: payload.model || agent.defaultModel || defaultModelFor(agent.runtime),
        taskId: task.taskId,
        manifestStatus: 'APPROVED',
        approvedManifest: approvedManifest as any,
        manifestDecidedAt: new Date(),
        metadata: { type: 'task-execution', agentId: agent.id, dispatch: dispatchBlob } as any,
      },
    })
    logger.info(`bypassed run ${run.id} started (task: ${task.taskId})`)
    void agentEngine
      .run(run.id, { queued: false, taskContext, dispatchContext: context, capabilityJwt, runLimits: payload.runLimits, startedBy: payload.startedBy, pickedSkill: pickedSkillOf(payload.skill)?.name })
      .catch(err => logger.error(`bypassed run ${run.id} failed:`, err))
    return run.id
  }

  // Deferred mode: what was approved on the run before this one, for this run only — rebuilt from the
  // current agent config every time so config changes take effect immediately.
  const given = approved ?? { tools: [], bashPatterns: [] }
  const approvedManifest = buildApprovedManifest(
    { tools: baseTools, bashPatterns: baseBashPatterns },
    {
      extendedTools: given.tools.map(t => ({ name: t.name, reason: t.reason ?? '' })),
      extendedBashPatterns: given.bashPatterns.map(p => ({ pattern: p.pattern, reason: p.reason ?? '' })),
    },
  )
  const approvalNoteText = approvalNote(given)

  const deferredManifest: DeferredManifest = { tools: [], bashPatterns: [] }

  const run = await prisma.agentRun.create({
    data: {
      ...runPackageColumns(context.packages, context),
      agentId: agent.id,
      sessionId: session.id,
      status: 'PENDING',
      inputText: approvalNoteText + payload.inputText,
      model: payload.model || agent.defaultModel || defaultModelFor(agent.runtime),
      taskId: task.taskId,
      manifestStatus: 'APPROVED',
      approvedManifest: approvedManifest as any,
      manifestDecidedAt: new Date(),
      metadata: { type: 'task-execution', agentId: agent.id, dispatch: dispatchBlob } as any,
    },
  })
  logger.info(`run ${run.id} started (task: ${task.taskId}, agent: ${agent.handle})`)

  // The run's time limit is the engine's (runLimitWatch.ts), not a timer here or on hq.
  void agentEngine
    .run(run.id, { taskContext, deferredManifest, dispatchContext: context, capabilityJwt, runLimits: payload.runLimits, startedBy: payload.startedBy, pickedSkill: pickedSkillOf(payload.skill)?.name })
    .then(outcome =>
      reportDeferredManifestIfAny({
        runId: run.id,
        sessionId: session.id,
        taskId: task.taskId,
        agentId: agent.id,
        agentHandle: agent.handle,
        deferredManifest,
        // See chatExecution.ts's identical comment — undefined is an
        // unreachable defensive fallback here, never a live branch.
        terminalStatus: outcome?.status ?? 'FAILED',
        withheldFrame: outcome?.withheldFrame,
        flavor: 'task',
      }).catch(err =>
        logger.error(`deferred-manifest report failed for run ${run.id} — the approval card may be lost:`, err),
      ),
    )
    .catch(err => logger.error(`run ${run.id} failed:`, err))

  return run.id
}
