/**
 * Workforce Template Types & Client-Safe Utilities
 * =================================================
 *
 * Pure types and collision-resolution utilities used by both client (review
 * page) and server (service, MCP tools). No server-side imports allowed here.
 */

import { isValidAgentHandle } from '../agents/agentHandle'

// ── Template spec types ──────────────────────────────────────────────────────

/** A skill the template carries for one of its agents: `slug` is its folder in the package. */
export type AgentSkillSpec = {
  slug: string
  name: string
  description: string
}

export type AgentSpec = {
  handle: string
  name: string
  role: string
  responsibilities: string
  approval?: string
  allowedTools?: Array<{ name: string; state: string }>
  allowedBashPatterns?: Array<{ pattern: string; state: string }>
  skills?: AgentSkillSpec[]
}

export type TeamSpec = {
  name: string
  purpose: string
  agents: AgentSpec[]
}

/** A project the template starts, with the task types and custom fields it adds beside Task and Epic (spec D16). */
export type ProjectSpec = {
  name: string
  description?: string
  defaultAgentHandle?: string
  types: Array<{ name: string; icon: string }>
  fields: Array<{ name: string }>
}

export type WorkforceTemplateContent = {
  teams: TeamSpec[]
  projects: ProjectSpec[]
}

// ── Selection types (used by review page and apply logic) ────────────────────

export type AgentSelection = {
  handle: string           // original handle from template
  resolvedHandle: string   // handle after collision resolution
  include: boolean
  skills: Array<{ slug: string; include: boolean }>
}

export type TeamSelection = {
  name: string
  include: boolean
  agents: AgentSelection[]
}

export type ProjectSelection = {
  name: string
  include: boolean
  defaultAgentHandle?: string  // updated to resolved handle
}

export type ApplicationSelections = {
  teams: TeamSelection[]
  projects: ProjectSelection[]
}

/** Whether a value has the shape of a person's selections, before it is stored as a draft the review page will read. */
export function isApplicationSelections(v: unknown): v is ApplicationSelections {
  const rec = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
  const list = (x: unknown, each: (item: Record<string, unknown>) => boolean) => Array.isArray(x) && x.every(i => rec(i) && each(i))
  const marked = (i: Record<string, unknown>) => typeof i.name === 'string' && typeof i.include === 'boolean'
  if (!rec(v)) return false
  return list(v.teams, t => marked(t) && list(t.agents, a =>
    typeof a.handle === 'string' && typeof a.resolvedHandle === 'string' && typeof a.include === 'boolean'
    && list(a.skills, s => typeof s.slug === 'string' && typeof s.include === 'boolean')))
    && list(v.projects, p => marked(p) && (p.defaultAgentHandle === undefined || typeof p.defaultAgentHandle === 'string'))
}

// ── Handle checks ────────────────────────────────────────────────────────────

/** Why an included agent's handle cannot be used, by `<team>/<template handle>`; an agent with no problem is absent. */
export function handleProblems(selections: ApplicationSelections, existing: ReadonlySet<string>): Record<string, { handle: string; why: string }> {
  const problems: Record<string, { handle: string; why: string }> = {}
  const seen = new Map<string, number>()
  const included = selections.teams.filter(t => t.include).flatMap(t => t.agents.filter(a => a.include).map(a => ({ key: `${t.name}/${a.handle}`, handle: a.resolvedHandle })))
  for (const { handle } of included) seen.set(handle, (seen.get(handle) ?? 0) + 1)
  for (const { key, handle } of included) {
    if (!isValidAgentHandle(handle)) problems[key] = { handle, why: 'not a valid handle' }
    else if (existing.has(handle)) problems[key] = { handle, why: 'already taken' }
    else if ((seen.get(handle) ?? 0) > 1) problems[key] = { handle, why: 'used twice here' }
  }
  return problems
}

// ── Collision utilities ──────────────────────────────────────────────────────

/** Returns the first non-colliding handle: `handle`, `handle-1`, `handle-2`, … */
export function suggestHandle(handle: string, existing: Set<string>): string {
  if (!existing.has(handle)) return handle
  let i = 1
  while (existing.has(`${handle}-${i}`)) i++
  return `${handle}-${i}`
}

/**
 * Builds the initial ApplicationSelections for a template, resolving any
 * handle collisions against the provided set of existing handles.
 * All items default to `include: true`.
 */
export function buildInitialSelections(
  template: WorkforceTemplateContent,
  existingHandles: Set<string>
): ApplicationSelections {
  // Track handles we are about to create so intra-template collisions are also
  // caught (e.g. two agents in the template with the same handle).
  const usedHandles = new Set(existingHandles)

  // Map original handle → resolved handle for cross-reference updates
  const resolvedHandleMap: Record<string, string> = {}

  const teams: TeamSelection[] = template.teams.map((team) => ({
    name: team.name,
    include: true,
    agents: team.agents.map((agent) => {
      const resolved = suggestHandle(agent.handle, usedHandles)
      usedHandles.add(resolved)
      resolvedHandleMap[agent.handle] = resolved
      return {
        handle: agent.handle,
        resolvedHandle: resolved,
        include: true,
        skills: (agent.skills ?? []).map((s) => ({ slug: s.slug, include: true })),
      }
    }),
  }))

  const projects: ProjectSelection[] = template.projects.map((project) => ({
    name: project.name,
    include: true,
    defaultAgentHandle: project.defaultAgentHandle
      ? (resolvedHandleMap[project.defaultAgentHandle] ?? project.defaultAgentHandle)
      : undefined,
  }))

  return { teams, projects }
}
