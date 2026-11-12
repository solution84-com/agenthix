/**
 * DispatchService — hq's half of the dispatch seam (plan 5d-2 task 6).
 *
 * Pre-resolves everything a run needs (agent config, chat/task context,
 * mounts, risk rules, provider key), mints the §2a capability, and
 * hands both to site over `siteRuntimeStore.dispatchRun`. As of plan 5d-2
 * task 9a (the dispatch flip), TaskRunner.execute, sessions/actions.ts's
 * triggerAgentRun all call this module directly — the
 * drivers dispatch and return; nothing here runs a turn to completion
 * in-process anymore. `resolveSiteIdForTask`/`resolveSiteIdForSession` below
 * reach the same answer `dispatchTaskRun`/`dispatchChatRun` get via
 * `resolveCapabilityClaims` — the site holding the storage the run works in —
 * for callers that need it WITHOUT minting a fresh capability (manifest
 * approval, cancel, the task-machine's frame-ownership check).
 *
 * The context-building logic below is the verbatim shape of what
 * ChatRunner.run (session resolution), TaskRunner.execute
 * (board-column formatting, session upsert) do today — moved
 * here rather than reimplemented, since the run itself is about to start
 * happening on site instead of in this process.
 *
 * The reconcile-on-reconnect sweep is a sibling module, `reconcileService.ts`
 * — split out to keep both files under the repo's 500-line rule, and because
 * its event sink needs to be an injected parameter rather than an import (see
 * that module's own doc comment for the import-cycle reasoning). The wire-
 * payload converters (`toSeed`, `toAgentConfigPayload`) are a second sibling,
 * `dispatchPayloads.ts` — same 500-line reason, moved there in plan 5d-2 task
 * 9b when this file's own growth (createSession's D3 seeding,
 * getAgentPromptPreview's re-point) pushed it back over.
 */
import { HttpError, prisma } from 'wasp/server'
import type { Agent } from '@prisma/client'
import type { ModelViaProvider, PickedSkill, RunDispatchPayload, RunStartedBy } from '@agenthix/core'
import { Logger } from '../server/utils/logger'
import { resolvePrimaryLocation } from '../storage/primaryLocationService'
import type { LocationRef } from '@agenthix/core'
import { ownerSlug } from './locationResolver'
import { resolveCapabilityClaims } from '../server/identity/capabilityService'
import { signCapability } from '../server/identity/tokenService'
import * as siteRuntimeStore from '../sessions/siteRuntimeStore'
import { toSeed } from './dispatchPayloads'
import { requireOpenSession } from '../sessions/closedSession'
import { runBoundary } from './overrides/agentOverrideService'
import { chooseBoundaryRun, chooseKeptSessionRun, type RunChoice } from './runModel'
import { buildContext, grantTargetOf } from './runContext'
import { runLimitsFor } from './runLimits/runLimitsService'
import { askForTaskRun, withBrief } from '../conversations/taskThread/brief'
import { conversationAskOfRun } from '../conversations/work/tasks/taskModel'
import { fellBackLine, keepModelNote } from '../conversations/work/workers/workModel'
import { personMayWorkInProject, OnBehalfOfLostAccessError } from '../projects/taskOnBehalfOf'
import { placeStorageOf } from '../projects/personalProject'
import { taskCommentsForRun } from './taskCommentsForRun'
import { RunPersonLostAccessError } from './taskExecutionReasons'
import { scheduledChangeHold } from '../sites/scheduled/runHold'
import { chooseTaskRun, readyTaskSession } from './taskRunModel'
import { resolveSiteIdForSession } from './dispatchSiteResolution'
import { isOwnConversation } from '../assets/delivery/personSkills'
import { codeWorkForRun } from '../branches/runCodeWork'
import type { PreparedCodeWork } from '../branches/codeWorkDispatch'

const logger = new Logger('DispatchService')

export const TASK_INPUT_MESSAGE = 'Execute your assigned task.'
/** The first message of a task run carrying on after its last run paused for a scheduled change (runHold.ts). */
export const TASK_CONTINUE_MESSAGE = 'Your work on this task was paused part way for scheduled maintenance, which is now done. Carry on from where you stopped.'

/**
 * Chat dispatch. The session copy already exists (created by hq's UI action)
 * — this reads it, mints the chat capability, and dispatches. Does not
 * write a USER transcript entry: that now happens on site's side of
 * `run.dispatch` (T8), keyed off `hideUserMessage` riding in the payload.
 *
 * The run is on behalf of its sender (`senderId`; a chat's own person when
 * none is named, as for a voice turn), who is recorded on the message. In a
 * task's session the sender must still be on the task's project.
 */
export async function dispatchChatRun(
  sessionId: string,
  inputText: string,
  agent: Agent,
  sessionModel?: string | null,
  opts?: { hideUserMessage?: boolean; senderId?: string; skill?: PickedSkill; routine?: RoutineDispatch; choice?: RunChoice },
): Promise<{ runId: string }> {
  const session = await prisma.agentSession.findUnique({ where: { id: sessionId } })
  if (!session) throw new Error(`DispatchService: session ${sessionId} not found`)
  // Every chat path — typed and voice — comes through here (adr-0076).
  requireOpenSession(session)
  // A message waits while a scheduled change holds runs where it would run (host-management spec §14).
  const hold = await scheduledChangeHold(await resolveSiteIdForSession(session))
  if (hold) throw new HttpError(409, hold.message)
  const senderId = opts?.senderId ?? session.userId
  if (session.taskId) await requireSenderOnTaskProject(session.taskId, senderId)

  const meta = (session.metadata ?? {}) as Record<string, unknown>
  // Where this chat works, and therefore which machine it runs on — a chat
  // opened from a project's files runs where those files are, whether or not
  // a task anchors it. The claim's own "task-anchored project" field stays a
  // separate question, derived from the taskId below.
  const primaryLoc = resolvePrimaryLocation(session)
  const effectiveTaskId = session.taskId ?? null

  // Computed once, ahead of buildContext: the same derivation
  // resolveCapabilityClaims (capabilityService.ts) makes against this same
  // session, so the capability's tool ceiling and this payload's model always
  // agree on which boundary applies.
  const boundary = await runBoundary(session)
  const routine = opts?.routine
  const startedBy: RunStartedBy = routine?.startedBy ?? 'person'
  // A worker's brief comes with the model it was chosen to run on (workers/workModel.ts); any other run resolves its own.
  const choice = opts?.choice ?? await chooseBoundaryRun(boundary, agent.id, session.taskId ? senderId : session.userId, routine?.pick)

  // Resolved ahead of the context: a subscription the context hands out is
  // granted to the site and runner the capability names.
  // In a task's session the sender is who the run is for, signed so a task the
  // run creates is on their behalf. A plain chat's person is its owner.
  const claims = await resolveCapabilityClaims({
    agent, session, primaryLoc, taskId: effectiveTaskId, startedBy,
    onBehalfOfUserId: session.taskId || routine ? senderId : null,
  })
  const context = await buildContext(agent, 'chat', primaryLoc, boundary, {
    chat: {
      sessionContext: (meta.context as string | null) ?? null,
    },
    brief: inputText,
    // A plain chat is on behalf of its person, the session's owner (runOnBehalfOf.ts).
    personUserId: session.taskId ? senderId : session.userId,
    startedBy,
    choice,
    grantTo: grantTargetOf(claims),
    // The person's own chat, or a worker their own conversation briefed on their behalf (skills spec part 4).
    ownConversation: isOwnConversation({
      taskId: session.taskId, sessionUserId: session.userId, senderId, conversationId: session.conversationId,
      conversation: session.conversationId
        ? await prisma.conversation.findUnique({ where: { id: session.conversationId }, select: { openedById: true, home: true } })
        : null,
    }),
  })
  const { token: capabilityJwt } = await signCapability(claims)

  const payload: RunDispatchPayload = {
    kind: 'chat',
    startedBy,
    capabilityJwt,
    session: toSeed(session),
    inputText,
    ...(opts?.skill ? { skill: opts.skill } : {}),
    model: choice.model || sessionModel || '',
    hideUserMessage: opts?.hideUserMessage ?? false,
    context,
    runLimits: await runLimitsFor(boundary),
    ...(senderId ? { onBehalfOfUserId: senderId } : {}),
    ...(routine ? { routineId: routine.routineId } : {}),
  }

  // A run on a code workspace works on its work's own branch (live preview spec, part 2).
  const code = await codeWorkForRun({
    session, primaryLoc, personId: session.taskId ? senderId : session.userId, agentId: agent.id, runSiteId: claims.siteId, inputText,
  })
  if (code) context.codeWork = code.codeWork
  const result = await dispatchHolding(code, () => siteRuntimeStore.dispatchRun(claims.siteId, payload))
  return { runId: result.runId }
}

/**
 * A routine's run (adr-0177): one firing, in a session of its own, started by its schedule or by a person's Run
 * now, with the routine's model as the pick.
 */
export type RoutineDispatch = { routineId: string; startedBy: Extract<RunStartedBy, 'person' | 'schedule'>; pick: ModelViaProvider | null }

/** Dispatches, holding the run's branch as starting until the site has the run (`branches/working.ts`). */
async function dispatchHolding<T>(code: PreparedCodeWork | null, dispatch: () => Promise<T>): Promise<T> {
  try {
    return await dispatch()
  } finally {
    code?.release()
  }
}

async function requireSenderOnTaskProject(taskId: string, senderId: string): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } })
  if (!task || !(await personMayWorkInProject(task.projectId, senderId))) {
    throw new HttpError(403, "Sending into this task's session requires being on its project")
  }
}

/**
 * Task dispatch. Moves TaskRunner.execute's session upsert (lines 208-229)
 * and board-column formatting — NOT the RUN_QUEUED→RUN_ACTIVE claim,
 * per-(agent,project) serialisation, or local AgentRun creation, which stay
 * in TaskRunner until a later task rewires its call sites. Returns null (with
 * the exact log lines TaskRunner uses today) when the task has vanished or no
 * ADMIN user exists — mirroring TaskRunner.execute's own early-return
 * behavior in both cases.
 */
export async function dispatchTaskRun(
  taskId: string,
  agent: Agent,
  startedBy: RunStartedBy,
): Promise<{ runId: string; sessionId: string } | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      title: true,
      description: true,
      projectId: true,
      onBehalfOfUserId: true,
      runOnBehalfOfUserId: true,
      modelChoice: true,
      number: true,
      type: { select: { name: true, columns: { select: { name: true, state: true }, orderBy: { order: 'asc' } } } },
      project: { select: { name: true, slug: true, key: true, personalOwnerId: true, personalSpace: true } },
    },
  })
  if (!task) {
    logger.warn(`DispatchService: task ${taskId} not found during dispatch`)
    return null
  }

  // Bookkeeping only (see sessionEntitlement.ts): any admin still in the organisation.
  const adminSettings = await prisma.userSettings.findFirst({ where: { role: 'ADMIN', user: { deactivatedAt: null } } })
  const adminUserId = adminSettings?.userId
  if (!adminUserId) {
    logger.error(`DispatchService: admin user not found — cannot dispatch task ${taskId}`)
    return null
  }

  // Defensive only — Task.projectId is a non-nullable FK (schema.prisma), so this
  // branch should be unreachable; kept because TaskRunner.execute guards it too.
  if (!task.projectId) {
    logger.warn(`DispatchService: task ${taskId} has no project — cannot dispatch`)
    return null
  }

  // Every start of a task passes here — a person's Run or Start, an approval, a
  // start time or an agent's tool — so this is where a task whose person has lost access is held
  // back (adr-0089), whatever queued it again.
  if (!(await personMayWorkInProject(task.projectId, task.onBehalfOfUserId))) {
    throw new OnBehalfOfLostAccessError(taskId)
  }
  // A run a person started is on their behalf (spec §9); one nobody started is
  // on the task's person. The starter must still be on the project too.
  const runPersonId = (startedBy === 'person' && task.runOnBehalfOfUserId) || task.onBehalfOfUserId
  if (runPersonId !== task.onBehalfOfUserId && !(await personMayWorkInProject(task.projectId, runPersonId))) {
    throw new RunPersonLostAccessError(taskId)
  }

  // The site's run context still names a board (core's runContext): a task is on no board (adr-0176), so it is
  // given the task's type and that type's columns, each with the task state it sits in.
  const boardColumns = task.type && task.type.columns.length > 0
    ? task.type.columns.map(c => `- ${c.name} (${c.state})`).join('\n')
    : 'No columns defined'

  // A personal project's task runs as its person — their credentials, choices and agent settings — and works in
  // the person's own storage for Your space, in the project's own for any other personal project. Any other
  // task works in its project's storage and runs as the project. The session row below records the same
  // location, and `resolveRunner` and `runBoundary` both derive from it and the task, so nothing downstream
  // can disagree.
  const personalOwnerId = task.project.personalOwnerId
  const storage = placeStorageOf({ id: task.projectId, personalOwnerId, personalSpace: task.project.personalSpace })
  const primaryLoc: LocationRef = { ownerType: storage.ownerType, ownerId: storage.ownerId, taskId }
  const primaryOwnerSlugValue = ownerSlug(storage.ownerType, storage.ownerId, storage.ownerType === 'project' ? task.project.slug : null)
  // A personal task's session is its person's; any other task's names an admin
  // only as bookkeeping (see sessionEntitlement.ts).
  const sessionUserId = personalOwnerId ?? adminUserId

  const taskKey = `${task.project.key}-${task.number}`

  // The run's model and runtime follow the work models (taskRunModel.ts); a session on another runtime that nothing
  // carries on in is replaced first, and a run that paused for a scheduled change is carried on where it was.
  const runBoundaryOf = personalOwnerId ? { type: 'user' as const, id: personalOwnerId } : { type: primaryLoc.ownerType, id: primaryLoc.ownerId }
  // A run a conversation asked for may name a model, or take that conversation's (conversations/work/tasks/taskModel.ts).
  const asked = await conversationAskOfRun(taskId)
  const chosen = await chooseTaskRun(runBoundaryOf, agent, runPersonId, task.modelChoice, asked)
  if (asked) await keepModelNote(asked.operationId, asked.args, await fellBackLine(chosen.resolution))
  const { paused } = await readyTaskSession(taskId, chosen)

  const agentSession = await prisma.agentSession.upsert({
    where: { taskId },
    // Backfill, not a general update: every other field on an existing row
    // belongs to the run in flight and is left alone. These two are the row's
    // account of where the run works, and a session created before those
    // columns existed carries neither — which, now that a location-less session
    // resolves to no storage at all, would give its task run a container with
    // nothing mounted. Writing the task's CURRENT project also keeps the row in
    // step with a task that has moved, the same freshness `runBoundary` gets by
    // resolving the project rather than trusting the row.
    update: {
      primaryOwnerType: primaryLoc.ownerType,
      primaryOwnerId: primaryLoc.ownerId,
      ...(personalOwnerId ? { userId: personalOwnerId } : {}),
    },
    create: {
      title: task.title ?? `Task ${taskId}`,
      status: 'ACTIVE',
      sessionType: 'task',
      model: chosen.model,
      // The runtime is recorded once, at creation (adr-0078) — never backfilled
      // by the update above.
      runtime: chosen.runtime,
      agentId: agent.id,
      userId: sessionUserId,
      taskId,
      metadata: { agentId: agent.id },
      primaryOwnerType: primaryLoc.ownerType,
      primaryOwnerId: primaryLoc.ownerId,
      primaryWorkspaceId: null,
    },
  })
  // Same derivation resolveCapabilityClaims makes against this same agentSession.
  const boundary = await runBoundary(agentSession)
  // A session kept on another runtime (readyTaskSession) carries on with its own model, and is given its provider.
  const kept = agentSession.runtime && agentSession.model && agentSession.runtime !== chosen.runtime
  const choice = kept
    ? await chooseKeptSessionRun({ agentId: agent.id, boundary: runBoundaryOf, userId: runPersonId, session: { runtime: agentSession.runtime!, model: agentSession.model! } })
    : chosen

  // The admin on a task session's row is bookkeeping. Only a person's start is
  // signed in; a run nobody started is left to the control plane's default, the
  // task's person as it is when asked.
  const claims = await resolveCapabilityClaims({
    agent, session: agentSession, primaryLoc, taskId, startedBy,
    onBehalfOfUserId: startedBy === 'person' ? runPersonId : null,
  })
  const context = await buildContext(
    agent,
    'task',
    primaryLoc,
    boundary,
    {
      grantTo: grantTargetOf(claims),
      personUserId: runPersonId,
      startedBy,
      task: {
        taskId,
        taskKey,
        title: task.title ?? taskId,
        description: task.description ?? 'No description',
        projectId: task.projectId,
        projectName: task.project.name,
        projectSlug: primaryOwnerSlugValue,
        boardName: task.type?.name ?? 'Task',
        columns: boardColumns,
        comments: await taskCommentsForRun(taskId, agent.id),
      },
      choice,
    },
    primaryOwnerSlugValue,
  )
  const { token: capabilityJwt } = await signCapability(claims)

  const ask = startedBy === 'person' ? await askForTaskRun(taskId) : null
  const payload: RunDispatchPayload = {
    kind: 'task',
    startedBy,
    capabilityJwt,
    session: toSeed(agentSession),
    // A run asked for in the task's thread carries the person's ask as its brief.
    inputText: paused ? TASK_CONTINUE_MESSAGE : withBrief(TASK_INPUT_MESSAGE, ask?.brief ?? null),
    ...(ask?.skill && !paused ? { skill: ask.skill } : {}),
    model: choice.model || agentSession.model || '',
    hideUserMessage: false,
    context,
    runLimits: await runLimitsFor(boundary),
    ...(runPersonId ? { onBehalfOfUserId: runPersonId } : {}),
  }

  const code = await codeWorkForRun({ session: agentSession, primaryLoc, personId: runPersonId, agentId: agent.id, runSiteId: claims.siteId })
  if (code) context.codeWork = code.codeWork
  const result = await dispatchHolding(code, () => siteRuntimeStore.dispatchRun(claims.siteId, payload))
  return { runId: result.runId, sessionId: result.sessionId }
}

// Site resolution for post-dispatch callers (resolveSiteIdForTask,
// resolveSiteIdForSession) lives in dispatchSiteResolution.ts, not here — same
// 500-line reason as reconcileService.ts; re-exported so every existing
// `dispatchService.resolveSiteIdFor*` namespace-import call site keeps
// working unchanged.
export { resolveSiteIdForTask, resolveSiteIdForSession } from './dispatchSiteResolution'

// The dispatch context itself is built in runContext.ts, not here — the
// 500-line rule, the same reason reconcileService.ts and
// dispatchSiteResolution.ts are siblings. Re-exported so every existing
// `dispatchService.buildContext` call site keeps working unchanged.
export { buildContext } from './runContext'

// Reconcile-on-reconnect lives in reconcileService.ts, not here — see that
// module's own doc comment for why it's a sibling file rather than a
// section of this one.
