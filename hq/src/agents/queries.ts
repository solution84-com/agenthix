/**
 * Agent Queries
 * ==============
 *
 * Agents are site-level shared resources — all authenticated users
 * see the same pool of agents.
 */
import { type GetAgents, type GetAgent, type GetAgentByHandle, type GetAgentDetail, type GetAgentChatStats, type GetAgentSkills, type GetAgentPromptPreview } from 'wasp/server/operations'
import { countTasks } from '../shared/taskCounts'
import { HttpError } from 'wasp/server'
import type { RunRow, AgentPromptPreviewResult, AgentListItem } from '@agenthix/core'
import { agentListItem } from './agentListItem'
import { readAgentContent } from '../packages/agentPackageService'
import { skillEntries } from '../packages/skillFiles'
import { resolveAgentSiteId, sitesForAgent } from './agentSite'
import * as siteRuntimeStore from '../sessions/siteRuntimeStore'
import { toAgentConfigPayload } from './dispatchPayloads'
import { rethrowSiteUnreachableAsHttp, rethrowDispatchErrorAsHttp } from '../storage/httpErrors'
import { resolveRunPackages } from '../packages/runPackages'
import { entitledProjectsFilter } from '../projects/membership'
import { sessionsInEntitledProjects } from '../sessions/sessionEntitlement'
import { runVisibilityFilter } from '../sessions/runReadHelpers'
import { Logger } from '../server/utils/logger'
import { withRunPlaceholders } from './promptPlaceholders'

const logger = new Logger('Agents')

type GetAgentsArgs = void
type GetAgentArgs = { id: string }
type GetAgentByHandleArgs = { handle: string }
type GetAgentDetailArgs = { id: string }

export const getAgents: GetAgents<GetAgentsArgs, AgentListItem[]> = async (_args, context) => {
  if (!context.user) {
    throw new HttpError(401, 'Not authenticated')
  }

  // All agents are shared site-level resources — no user scoping
  const agents = await context.entities.Agent.findMany({ orderBy: { createdAt: 'desc' } })
  return agents.map(agentListItem)
}

export const getAgent: GetAgent<GetAgentArgs, any> = async (args, context) => {
  if (!context.user) {
    throw new HttpError(401, 'Not authenticated')
  }

  const agent = await context.entities.Agent.findUnique({
    where: { id: args.id },
  })

  if (!agent) {
    throw new HttpError(404, 'Agent not found')
  }

  return agent
}

export const getAgentByHandle: GetAgentByHandle<GetAgentByHandleArgs, any> = async (args, context) => {
  if (!context.user) {
    throw new HttpError(401, 'Not authenticated')
  }

  const agent = await context.entities.Agent.findUnique({
    where: { handle: args.handle },
  })

  if (!agent) {
    throw new HttpError(404, 'Agent not found')
  }

  return agent
}

export const getAgentDetail: GetAgentDetail<GetAgentDetailArgs, any> = async (args, context) => {
  if (!context.user) {
    throw new HttpError(401, 'Not authenticated')
  }

  // Chat sessions are owner-only (ADR-0041); task activity stays
  // org-visible. Session titles are generated from the first user message
  // (written by the site's naming service) and run inputText/outputText are
  // the literal message text, so both need the same scoping as getRecentActivity.
  const chatOwnerFilter = {
    OR: [
      { sessionType: { not: 'chat' } },
      { userId: context.user.id },
    ],
  }

  // Work in a private project is for its members: an agent's sessions, runs and
  // assigned tasks there are dropped for anyone else, whoever the agent is
  // (spec §6.4, SC-402). Chats are already owner-only above; this narrows the
  // task-scoped sessions the org-visible branch would otherwise let through.
  const inEntitledProjects = sessionsInEntitledProjects(context.user.id)

  const [agent, sessionCount, assignedTasks] = await Promise.all([
    context.entities.Agent.findUnique({
      where: { id: args.id },
      include: {
        sessions: {
          where: { ...chatOwnerFilter, AND: [inEntitledProjects] },
          select: {
            id: true,
            title: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: 'desc' as const },
          take: 10,
        },
      },
    }),
    context.entities.AgentSession.count({
      where: { agentId: args.id, ...inEntitledProjects },
    }),
    context.entities.Task.findMany({
      where: { assignedAgentId: args.id, project: entitledProjectsFilter(context.user.id) },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        runState: true,
        project: { select: { id: true, name: true } },
        board: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' as const },
      take: 10,
    }),
  ])

  if (!agent) {
    throw new HttpError(404, 'Agent not found')
  }

  // Runs now live on site (plan 5d-2 task 9b) — `runCount` and the display
  // list both read through the store; `totalTokens` sums over the same
  // unfiltered set the display list is drawn from and then privacy-filtered
  // (ownership is never a reason to hide a run from the token total, only
  // from the content list).
  //
  // Asked of every site this agent has a session on, not one: a run lives
  // wherever the storage it works in lives, so an agent working across two
  // machines has its runs split across them. The lists are merged and
  // re-sorted before the newest are taken, since each site orders only its
  // own; the count and the token total sum.
  // Finding 2 (SC-344): wrapped so an unreachable site surfaces as an
  // explicit 503, not a bare 500.
  // A session naming no site is passed over rather than refusing the page: its
  // runs are unreachable either way, and one bad session should not blank an
  // agent. An unreachable site still fails explicitly, below.
  const { siteIds, unresolved } = await sitesForAgent(args.id)
  if (unresolved > 0) {
    logger.warn(`${unresolved} of agent ${args.id}'s session(s) name no Execution Site — their runs are not in this total`)
  }
  let runCount = 0
  let runs: RunRow[] = []
  try {
    const perSite = await Promise.all(
      siteIds.map(async (siteId) => {
        const [countResult, runResult] = await Promise.all([
          siteRuntimeStore.countRuns(siteId, { agentId: args.id }),
          siteRuntimeStore.listRuns(siteId, { agentId: args.id }),
        ])
        return { count: countResult.count, runs: runResult }
      }),
    )
    for (const site of perSite) {
      runCount += site.count
      runs.push(...site.runs)
    }
    runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  } catch (err) {
    rethrowSiteUnreachableAsHttp(err)
  }

  // The same rule getRecentActivity applies: a chat run is its
  // owner's, a task run its project members', and a run whose session cannot
  // be resolved is dropped rather than shown.
  const visibleRuns = (await runVisibilityFilter(context.user.id).visible(runs))
    .slice(0, 10)
    .map((r) => ({
      id: r.id,
      sessionId: r.sessionId,
      status: r.status,
      inputText: r.inputText,
      outputText: r.outputText,
      model: r.model,
      usage: r.usage,
      auditSummary: r.auditSummary,
      manifestStatus: r.manifestStatus,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      createdAt: r.createdAt,
      agentPackageDigest: r.agentPackageDigest,
    }))

  // Task counts: done by the task's own state, the rest by run state
  const { total: _total, ...taskCounts } = countTasks(assignedTasks)

  // Compute total tokens from all runs (RunRow.usage is core's TokenUsage —
  // totalTokens already sums input + cacheRead + cacheWrite + output).
  let totalTokens = 0
  for (const run of runs) {
    totalTokens += run.usage?.totalTokens ?? 0
  }

  return {
    ...agent,
    runs: visibleRuns,
    sessionCount,
    runCount,
    assignedTasks,
    taskCounts,
    totalTokens,
  }
}

export const getAgentChatStats: GetAgentChatStats<{ agentId: string }, any> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const entitled = entitledProjectsFilter(context.user.id)
  const [agent, queuedCount, runningCount, blockedCount] = await Promise.all([
    context.entities.Agent.findUnique({ where: { id: args.agentId }, select: { id: true } }),
    context.entities.Task.count({ where: { assignedAgentId: args.agentId, runState: { in: ['RUN_QUEUED', 'RUN_THROTTLED'] }, column: { not: null }, project: entitled } }),
    context.entities.Task.count({ where: { assignedAgentId: args.agentId, runState: 'RUN_ACTIVE', project: entitled } }),
    context.entities.Task.count({ where: { assignedAgentId: args.agentId, runState: 'RUN_BLOCKED', project: entitled } }),
  ])
  if (!agent) throw new HttpError(404, 'Agent not found')
  return { queuedCount, runningCount, blockedCount }
}

type GetAgentSkillsArgs = { agentId: string }

type GetAgentPromptPreviewArgs = { agentId: string; mode: 'chat' | 'task' }
// sections uses an inline object type (not PromptSection) to satisfy Wasp's SuperJSON Payload constraint
type GetAgentPromptPreviewResult = {
  systemPrompt: string
  userMessage:  string
  sections?:    { key: string; label: string; content: string; editable: boolean }[]
}

function isPromptSection(v: unknown): v is { key: string; label: string; content: string; editable: boolean } {
  if (typeof v !== 'object' || v === null) return false
  const s = v as Record<string, unknown>
  return typeof s.key === 'string' && typeof s.label === 'string' && typeof s.content === 'string' && typeof s.editable === 'boolean'
}

/**
 * The prompt is assembled on site (its AgentPromptBuilder, `agent.promptPreview`),
 * which returns its sections alongside the flattened prompt. A site on protocol
 * 7.0 sends no sections; that case shows the prompt as one read-only section.
 */
export const getAgentPromptPreview: GetAgentPromptPreview<GetAgentPromptPreviewArgs, GetAgentPromptPreviewResult> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const agent = await context.entities.Agent.findUnique({ where: { id: args.agentId } })
  if (!agent) throw new HttpError(404, 'Agent not found')

  // Building a preview reads no run and touches no storage, so any site that
  // could run this agent assembles the identical prompt — the default one
  // answers, and with no site connected this fails with the shared error.
  // Finding 2 (SC-344): wrapped so an unreachable site surfaces as an
  // explicit 503, not a bare 500.
  const siteId = await resolveAgentSiteId()
  let result: AgentPromptPreviewResult
  try {
    result = await siteRuntimeStore.promptPreview(siteId, {
      agent: toAgentConfigPayload(agent),
      sessionType: args.mode,
      packages: await resolveRunPackages(agent.id),
    })
  } catch (err) {
    rethrowDispatchErrorAsHttp(err)
  }

  const userMessage = args.mode === 'task' ? 'Execute your assigned task.' : ''
  // The wire result is not validated upstream, so a malformed `sections` falls back like an absent one.
  const wireSections: unknown = result.sections
  const sections = Array.isArray(wireSections) && wireSections.length > 0 && wireSections.every(isPromptSection)
    ? withRunPlaceholders(wireSections.map(({ key, label, content, editable }) => ({ key, label, content, editable })), args.mode)
    : [{ key: 'prompt', label: 'System Prompt', content: result.prompt, editable: false }]
  return { systemPrompt: result.prompt, userMessage, sections }
}

export const getAgentSkills: GetAgentSkills<GetAgentSkillsArgs, any[]> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const current = await readAgentContent(args.agentId)
  return current ? skillEntries(current.skillFiles) : []
}
