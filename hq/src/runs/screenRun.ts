/**
 * One run opened on the Runs screen (spec §6), and one tool call's output. Both are routed reads: the run's session,
 * given with its id, says which site to ask, and who may see the run is decided here from the session
 * (`canReachSessionContent`, adr-0041, adr-0062) — the same rule `getToolCallLog` applies. A run the person may not see
 * and one that does not exist are the same answer, null.
 */
import { prisma } from 'wasp/server'
import type { RunRow, ToolCallOutput } from '@agenthix/core'
import * as siteRuntimeStore from '../sessions/siteRuntimeStore'
import * as dispatchService from '../agents/dispatchService'
import { canReachSessionContent } from '../sessions/sessionEntitlement'
import { requestIsCurrent } from '../agents/manifestRequests'
import { agentSelect, namesOf, taskSelect } from './myRuns'
import { startedByLine, taskFacts } from './taskFacts'
import { outcomeText, riskyCallCount, runGroup } from './runsView'
import type { RunDetail, RunRequestDetail } from './screenTypes'
import { displaySiteName } from '../shared/siteName'

/** A worker's run leads to the conversation it works for; any other session's, to its place's list. */
function conversationHref(placePath: string, conversationId: string | null): string {
  return conversationId ? `${placePath}/t/${conversationId}` : placePath
}

const RUNTIME_LABEL: Record<string, string> = { 'claude-sdk': 'Claude Code', opencode: 'OpenCode' }

/** The most characters of one call's output sent to the browser; the rest is cut and said so. */
export const OUTPUT_MAX_CHARS = 1_000_000

async function loadRun(me: string, sessionId: string, runId: string) {
  const session = await prisma.agentSession.findUnique({
    where: { id: sessionId },
    include: { agent: { select: agentSelect }, task: { select: taskSelect } },
  })
  if (!session || !(await canReachSessionContent(session, me))) return null
  const siteId = await dispatchService.resolveSiteIdForSession(session)
  const run = await siteRuntimeStore.getRun(siteId, runId)
  // A run is read through the session it was found by; one that belongs to another is not this session's to show.
  if (!run || run.sessionId !== session.id) return null
  return { session, siteId, run }
}

function requestOf(run: RunRow, current: boolean, decidedBy: string | null): RunRequestDetail | null {
  // Every run starts with its agent's own tools marked approved; only a run that asked for more has a request.
  if (!run.manifestStatus || !run.pendingManifest) return null
  const manifest = (run.pendingManifest ?? {}) as {
    tools?: Array<{ name?: string }>; bashPatterns?: Array<{ pattern?: string }>; summary?: string
  }
  return {
    status: run.manifestStatus,
    tools: (manifest.tools ?? []).map((t) => t.name).filter((n): n is string => !!n),
    bashPatterns: (manifest.bashPatterns ?? []).map((p) => p.pattern).filter((n): n is string => !!n),
    summary: manifest.summary ?? null,
    answeredAt: run.manifestStatus === 'APPROVED' || run.manifestStatus === 'REJECTED' ? run.manifestDecidedAt : null,
    decidedBy,
    current,
  }
}

/** The run just before this one in its session, when it is within the newest few: what it was approved for is given to this one. */
async function runBefore(siteId: string, run: RunRow): Promise<RunRow | null> {
  const recent = await siteRuntimeStore.listRuns(siteId, { sessionId: run.sessionId, limit: 50 })
  const at = recent.findIndex((r) => r.id === run.id)
  return at >= 0 ? recent[at + 1] ?? null : null
}

function approvalGivenBy(before: RunRow | null, who: (id: string | null | undefined) => string | null): RunDetail['approvalGiven'] {
  if (before?.manifestStatus !== 'APPROVED') return null
  const asked = requestOf(before, false, null)
  if (!asked) return null
  return { tools: asked.tools, bashPatterns: asked.bashPatterns, by: who(before.manifestDecidedById), at: before.manifestDecidedAt }
}

export async function readRunDetail(me: string, args: { runId: string; sessionId: string }): Promise<RunDetail | null> {
  return (await readRunWithDetail(me, args))?.detail ?? null
}

/** The run opened in full, with its own record and its session, for a caller that says more of it (`runPage.ts`). */
export async function readRunWithDetail(me: string, args: { runId: string; sessionId: string }) {
  const loaded = await loadRun(me, args.sessionId, args.runId)
  if (!loaded) return null
  const { session, siteId, run } = loaded
  const task = session.task

  const [site, placeProject] = await Promise.all([
    prisma.executionSite.findUnique({ where: { siteId }, select: { label: true, isDefault: true } }),
    !task && session.primaryOwnerType === 'project' && session.primaryOwnerId
      ? prisma.project.findUnique({ where: { id: session.primaryOwnerId }, select: { key: true, name: true } })
      : Promise.resolve(null),
    Promise.resolve(),
  ])
  const before = await runBefore(siteId, run)
  const names = await namesOf(
    new Set([
      task?.onBehalfOfUserId, task?.runOnBehalfOfUserId, task?.queuedByUserId, run.manifestDecidedById, before?.manifestDecidedById,
    ].filter((id): id is string => !!id)),
    new Set(task?.queuedByAgentId ? [task.queuedByAgentId] : []),
  )
  const who = (id: string | null | undefined) => (!id ? null : id === me ? 'you' : names.users.get(id) ?? 'someone')

  const facts = task ? taskFacts(task, me, names) : null
  const current = run.manifestStatus === 'PENDING_APPROVAL'
    && (task ? task.runState === 'RUN_BLOCKED' : true)
    && (await requestIsCurrent(siteId, run))
  const group = current ? 'waiting' : runGroup(run, null)

  const detail: RunDetail = {
    runId: run.id, sessionId: session.id, status: run.status, group,
    outcome: group === 'waiting' ? 'wants approval' : group === 'running' ? null : outcomeText(run),
    error: run.error,
    kind: task ? 'task' : 'conversation',
    title: facts?.title ?? (session.title || 'Conversation'),
    ref: facts?.ref ?? null,
    href: facts?.href ?? conversationHref(placeProject ? `/projects/${placeProject.key}` : '/chat', session.conversationId),
    place: facts?.place ?? (placeProject ? { name: placeProject.name, projectKey: placeProject.key } : { name: 'Chat', projectKey: null }),
    agent: session.agent,
    startedByLine: facts ? startedByLine(facts.startedBy, facts.onBehalfOf, me) : 'by you',
    runtime: session.runtime ? RUNTIME_LABEL[session.runtime] ?? session.runtime : null,
    model: run.model, usage: run.usage, site: site ? displaySiteName(site) : null,
    startedAt: run.startedAt, endedAt: run.endedAt, createdAt: run.createdAt,
    request: requestOf(run, current, who(run.manifestDecidedById)), approvalGiven: approvalGivenBy(before, who), riskyCalls: riskyCallCount(run.auditSummary),
  }
  return { detail, run, session, siteId, names }
}

export type { ToolCallOutput } from '@agenthix/core'

/** What one call printed, found by the call's own id on the transcript's TOOL line; "not recorded" for a line from before ids were kept. */
export async function readToolCallOutput(
  me: string,
  args: { runId: string; sessionId: string; toolUseId: string },
): Promise<ToolCallOutput | null> {
  const loaded = await loadRun(me, args.sessionId, args.runId)
  if (!loaded) return null
  const { siteId, session } = loaded

  // The id must be one of this run's own calls, so a run never opens the output of another's.
  const calls = await siteRuntimeStore.listToolCalls(siteId, args.runId)
  if (!calls.some((c) => c.toolUseId === args.toolUseId)) return { recorded: false }

  const [line] = await siteRuntimeStore.listTranscript(siteId, session.id, { toolUseIds: [args.toolUseId] })
  if (!line || line.toolOutput === null || line.toolOutput === undefined) return { recorded: false }
  const text = typeof line.toolOutput === 'string' ? line.toolOutput : JSON.stringify(line.toolOutput, null, 2)
  return text.length > OUTPUT_MAX_CHARS
    ? { recorded: true, output: text.slice(0, OUTPUT_MAX_CHARS), truncated: true }
    : { recorded: true, output: text, truncated: false }
}
