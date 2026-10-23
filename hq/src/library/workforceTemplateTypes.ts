/**
 * Workforce Template Types & Client-Safe Utilities
 * =================================================
 *
 * Pure types and collision-resolution utilities used by both client (review
 * page) and server (service, MCP tools). No server-side imports allowed here.
 */

// ── Template spec types ──────────────────────────────────────────────────────

export interface AgentSkillSpec {
  slug: string
  name: string
  description: string
  content: string
}

export interface AgentSpec {
  handle: string
  name: string
  role: string
  responsibilities: string
  /** @deprecated Older templates carry it; ignored. The resolver decides the model. */
  defaultModel?: string
  approval?: string
  allowedTools?: Array<{ name: string; state: string }>
  allowedBashPatterns?: Array<{ pattern: string; state: string }>
  skills?: AgentSkillSpec[]
}

export interface TeamSpec {
  name: string
  purpose: string
  agents: AgentSpec[]
}

export interface BoardSpec {
  name: string
  templateId: string
}

export interface ProjectSpec {
  name: string
  description?: string
  defaultAgentHandle?: string
  boards: BoardSpec[]
}

export interface WorkforceTemplateContent {
  teams: TeamSpec[]
  projects: ProjectSpec[]
}

// ── Selection types (used by review page and apply logic) ────────────────────

export interface AgentSelection {
  handle: string           // original handle from template
  resolvedHandle: string   // handle after collision resolution
  include: boolean
  skills: Array<{ slug: string; include: boolean }>
}

export interface TeamSelection {
  name: string
  include: boolean
  agents: AgentSelection[]
}

export interface BoardSelection {
  name: string
  include: boolean
}

export interface ProjectSelection {
  name: string
  include: boolean
  defaultAgentHandle?: string  // updated to resolved handle
  boards: BoardSelection[]
}

export interface ApplicationSelections {
  teams: TeamSelection[]
  projects: ProjectSelection[]
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
    boards: project.boards.map((b) => ({ name: b.name, include: true })),
  }))

  return { teams, projects }
}
