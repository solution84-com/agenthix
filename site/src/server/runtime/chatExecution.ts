/**
 * Chat execution — plan 5d-2 task 8. The site half of hq's `ChatRunner.run`
 * (hq/src/agents/ChatRunner.ts): the USER transcript write, AgentRun creation
 * and engine dispatch, ported verbatim minus the hq-only parts that now ride
 * the dispatch payload — `sessionContext` arrives pre-resolved
 * on `context.chat` (dispatchService.ts's `buildContext`) instead of being
 * read here from hq's User/auth tables, and `recordActivity`/
 * `triggerSnapshotPush` are dropped (hq does both off the `run.status` frame,
 * siteEventHandler.ts). The deferred-manifest post-run continuation is
 * shared with taskExecution.ts — see deferredManifestReport.ts.
 */
import { prisma } from '#db'
import { SUMMARISE_NOW_INPUT, pickedSkillOf, type RunDispatchPayload } from '@agenthix/core'
import type { DeferredManifest } from '../../agents/runtime/types'
import { agentEngine } from '../../agents/runtime/AgentEngine'
import { buildApprovedManifest } from '../../agents/runtime/manifestParser'
import { coerceToolPermissions, coerceBashPatternPermissions, mergeWithAlwaysInjected } from '../../agents/runtime/toolPermissions'
import { ALWAYS_INJECTED_MCP_TOOLS } from '../../shared/mcpTools'
import { reportDeferredManifestIfAny } from './deferredManifestReport'
import { approvalForNextRun, approvalNote, replaceUnansweredRequests } from './nextRunApproval'
import { runPackageColumns } from '../../packages/runPackages'
import { generateSessionTitle } from '../../sessions/namingService'
import { UNTITLED_SESSION_TITLE } from '../../agents/runtime/currentSessionTitle'
import { Logger } from '../utils/logger'

const logger = new Logger('ChatExecution')

/** Creates the AgentRun and fires the engine (never awaited by the caller —
 *  dispatchHandler.ts acks with the returned runId well inside the channel's
 *  timeout; the run itself reports by frames). Returns the created run's id. */
export async function runChat(payload: RunDispatchPayload): Promise<string> {
  const { session, context, inputText, model, hideUserMessage, capabilityJwt, startedBy, runLimits, onBehalfOfUserId } = payload
  const agent = context.agent
  // Summarise now: a hidden message asking the runtime to summarise its memory (core's SUMMARISE_NOW_INPUT).
  const summarise = hideUserMessage && inputText === SUMMARISE_NOW_INPUT
  const pickedSkill = pickedSkillOf(payload.skill)?.name

  /**
   * The person's message, written once its run exists so it names that run —
   * a message waiting behind a running reply reads as waiting by its run. Site
   * owns the session's runtime fields, the title among them: an untitled
   * session is named from its first visible message on site's own row, and the
   * title handed to the engine so the RUNNING frame replicates it to hq.
   */
  const recordMessage = async (runId: string): Promise<string | null> => {
    if (hideUserMessage) return null
    await prisma.transcriptEntry.create({
      data: { sessionId: session.id, runId, role: 'USER', authorId: onBehalfOfUserId ?? null, content: inputText },
    })
    const row = await prisma.agentSession.findUnique({ where: { id: session.id }, select: { title: true } })
    return row?.title === UNTITLED_SESSION_TITLE
      ? generateSessionTitle(session.id, inputText, { AgentSession: prisma.agentSession })
      : null
  }

  const chatContext = context.chat ?? { sessionContext: null }

  // Base tool/pattern sets — only 'always'-state tools pre-approved; 'ask'-state
  // tools start outside the manifest and need HITL approval (ChatRunner.run's
  // original comment, ported verbatim).
  const toolPermissions = mergeWithAlwaysInjected(coerceToolPermissions(agent.allowedTools))
  const bashPermissions = coerceBashPatternPermissions(agent.allowedBashPatterns)
  const baseTools = [
    ...new Set([
      ...toolPermissions.filter(p => p.state === 'always').map(p => p.name),
      ...ALWAYS_INJECTED_MCP_TOOLS,
    ]),
  ]
  const baseBashPatterns = bashPermissions.filter(p => p.state === 'always').map(p => p.pattern)

  // ONLY the kind, what started the run and who it is for — never context or capabilityJwt (spec review, HIGH: a
  // RunContextPayload carries the run's own model credential in plaintext;
  // persisting it onto every AgentRun row would be a secret-at-rest
  // exposure hq's own equivalent flow never had).
  const dispatchBlob = { kind: 'chat' as const, startedBy, runLimits, ...(onBehalfOfUserId ? { onBehalfOfUserId } : {}) }

  // Read before the requests are replaced and before this run exists: the newest earlier run decides.
  // A message into a task's session is in that task too.
  const scope = { sessionId: session.id, taskId: session.taskId }
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
        inputText,
        model: model || agent.defaultModel,
        manifestStatus: 'APPROVED',
        approvedManifest: approvedManifest as any,
        manifestDecidedAt: new Date(),
        metadata: { dispatch: dispatchBlob } as any,
      },
    })
    logger.info(`bypassed run ${run.id} (session: ${session.id})`)
    const sessionTitle = await recordMessage(run.id)
    void agentEngine
      .run(run.id, { queued: true, chatContext, dispatchContext: context, capabilityJwt, sessionTitle, runLimits, startedBy, summarise, pickedSkill })
      .catch(err => logger.error(`bypassed run ${run.id} failed:`, err))
    return run.id
  }

  // Deferred mode: what was approved on the run before this one, for this run only, with a note telling the
  // agent. The note goes to the agent, never into the transcript: the run an approval starts sends no visible message.
  const given = approved ?? { tools: [], bashPatterns: [] }
  const approvedManifest = buildApprovedManifest(
    { tools: baseTools, bashPatterns: baseBashPatterns },
    {
      extendedTools: given.tools.map(t => ({ name: t.name, reason: t.reason ?? '' })),
      extendedBashPatterns: given.bashPatterns.map(p => ({ pattern: p.pattern, reason: p.reason ?? '' })),
    },
  )

  const deferredManifest: DeferredManifest = { tools: [], bashPatterns: [] }

  const run = await prisma.agentRun.create({
    data: {
      ...runPackageColumns(context.packages, context),
      agentId: agent.id,
      sessionId: session.id,
      status: 'PENDING',
      inputText: approvalNote(given) + inputText,
      model: model || agent.defaultModel,
      manifestStatus: 'APPROVED',
      approvedManifest: approvedManifest as any,
      manifestDecidedAt: new Date(),
      metadata: { dispatch: dispatchBlob } as any,
    },
  })
  logger.info(`run ${run.id} started (session: ${session.id})`)
  const sessionTitle = await recordMessage(run.id)

  void agentEngine
    .run(run.id, { queued: true, chatContext, deferredManifest, dispatchContext: context, capabilityJwt, sessionTitle, runLimits, startedBy, summarise, pickedSkill })
    .then(outcome =>
      reportDeferredManifestIfAny({
        runId: run.id,
        sessionId: session.id,
        taskId: null,
        agentId: agent.id,
        agentHandle: agent.handle,
        deferredManifest,
        // outcome is undefined only on the engine's dedup/skip branches, which
        // never populate deferredManifest — reportDeferredManifestIfAny's own
        // empty-collector check already returns before this value is ever read
        // in that case; FAILED is a defensive fallback, not a live branch.
        terminalStatus: outcome?.status ?? 'FAILED',
        withheldFrame: outcome?.withheldFrame,
        flavor: 'chat',
      }).catch(err =>
        logger.error(`deferred-manifest report failed for run ${run.id} — the approval card may be lost:`, err),
      ),
    )
    .catch(err => logger.error(`run ${run.id} failed:`, err))

  return run.id
}
