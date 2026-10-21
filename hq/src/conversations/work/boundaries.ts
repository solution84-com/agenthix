/**
 * The boundaries a person and an agent share, and the three checks that admit work to one (conversation layer
 * spec, Commissioning outside the place). A conversation may commission work in any of them, not only its own
 * place; each operation is admitted on its own, for its own boundary, as things stand at that moment: the person
 * is a member there, the agent is assigned there, and the tool is allowed there.
 *
 * A refusal is the lead's words to say, about the person it talks to ("you're not a member of Finance").
 */
import { prisma } from 'wasp/server'
import type { CapabilityEffectivePermissions } from '@agenthix/core'
import { runPermissions, type OverrideBoundary } from '../../agents/overrides/agentOverrideService'
import { projectStanding } from '../../projects/membership'
import { turnToolState } from '../../server/controlplane/turnCaller'
import type { AdmitToBoundary, SharedBoundary } from '../contract'

/** What the lead passes as `boundary` for the person's own space. */
export const PERSONAL_BOUNDARY_KEY = 'personal'
export const PERSONAL_BOUNDARY_NAME = 'your space'

export function personalBoundary(personId: string): SharedBoundary {
  return { key: PERSONAL_BOUNDARY_KEY, type: 'user', id: personId, name: PERSONAL_BOUNDARY_NAME }
}

/** The projects a person works in (a Member or Admin; never someone's personal project). */
function worksIn(personId: string) {
  return { personalOwnerId: null, members: { some: { userId: personId, role: { in: ['ADMIN' as const, 'MEMBER' as const] } } } }
}

const asProject = (p: { id: string; key: string; name: string }): SharedBoundary => ({ key: p.key, type: 'project', id: p.id, name: p.name })

/**
 * The person's own space, then every project they work in that the agent is assigned to, by name. Whether the
 * agent may start work in each is the admission's question.
 */
export async function sharedBoundaries(personId: string, agentId: string): Promise<SharedBoundary[]> {
  const projects = await prisma.project.findMany({
    where: { ...worksIn(personId), agents: { some: { agentId } } },
    select: { id: true, key: true, name: true },
    orderBy: { name: 'asc' },
  })
  return [personalBoundary(personId), ...projects.map(asProject)]
}

/**
 * The projects the person works in that the agent is not assigned to: places that exist and that the person can
 * reach, where no work of this agent's can start until a project admin assigns it — never "no such project".
 */
export async function unassignedProjects(personId: string, agentId: string): Promise<SharedBoundary[]> {
  const projects = await prisma.project.findMany({
    where: { ...worksIn(personId), agents: { none: { agentId } } },
    select: { id: true, key: true, name: true },
    orderBy: { name: 'asc' },
  })
  return projects.map(asProject)
}

/** How a person or the lead may name a project, reduced to its name: "the Walkthrough project" → "Walkthrough". */
export function projectWords(words: string): string {
  return words.trim().replace(/^["'“‘]|["'”’]$/g, '').replace(/^the\s+/i, '').replace(/\s+project$/i, '').trim()
}

/**
 * The places the words name for this person: their own space; else the project with that key (matched without
 * case); else the projects with that name — narrowed, when several share it, to those the person works in. Found
 * whether or not the person and the agent share it, so admission can say why it is refused. Empty when nothing
 * matches; more than one when the name is ambiguous.
 */
export async function placesNamed(personId: string, words: string): Promise<SharedBoundary[]> {
  const wanted = words.trim()
  if (wanted.toLowerCase() === PERSONAL_BOUNDARY_KEY) return [personalBoundary(personId)]
  const select = { id: true, key: true, name: true } as const
  const byKey = await prisma.project.findFirst({ where: { key: { equals: wanted, mode: 'insensitive' }, personalOwnerId: null }, select })
  if (byKey) return [asProject(byKey)]
  const name = projectWords(wanted)
  if (!name) return []
  const named = await prisma.project.findMany({ where: { name: { equals: name, mode: 'insensitive' }, personalOwnerId: null }, select, orderBy: { key: 'asc' } })
  if (named.length < 2) return named.map(asProject)
  const theirs = await prisma.project.findMany({ where: { id: { in: named.map(p => p.id) }, ...worksIn(personId) }, select, orderBy: { key: 'asc' } })
  return (theirs.length > 0 ? theirs : named).map(asProject)
}

/** A place as the lead reads it in a list: its key, then what it is. */
export function placeLine(b: SharedBoundary): string {
  return `${b.key} (${b.type === 'user' ? 'your space' : b.name})`
}

function asCapabilityPermissions(effective: Awaited<ReturnType<typeof runPermissions>>): CapabilityEffectivePermissions {
  const bypassed = effective.approval === 'bypassed'
  return {
    bypassed,
    allowedTools: bypassed ? [] : effective.allowedTools,
    allowedBashPatterns: effective.allowedBashPatterns,
    neverTools: effective.allowedTools.filter(p => p.state === 'never').map(p => p.name),
  }
}

async function memberRefusal(personId: string, boundary: SharedBoundary): Promise<string | null> {
  const person = await prisma.user.findUnique({ where: { id: personId }, select: { deactivatedAt: true } })
  if (!person || person.deactivatedAt !== null) return "you're no longer in the organisation"
  if (boundary.type === 'user') return boundary.id === personId ? null : "that space is someone else's"
  const standing = await projectStanding(boundary.id, personId)
  if (standing === 'none') return `you're not a member of ${boundary.name}`
  if (standing === 'reads') return `you can only read ${boundary.name}, not start work there`
  return null
}

/** What the lead says when the agent is not on a project: why, and how a project admin puts it there. */
export function notAssigned(agentName: string, projectName: string): string {
  return `${agentName} isn't assigned to ${projectName}; a project admin can assign ${agentName} there: in ${projectName}, ` +
    `open Members, select ＋ Add, then An agent, and Assign beside ${agentName}`
}

async function agentRefusal(agentId: string, boundary: SharedBoundary, tool: string): Promise<string | null> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { id: true, name: true, approval: true, allowedTools: true, allowedBashPatterns: true },
  })
  if (!agent) return 'this agent no longer exists'
  if (boundary.type === 'project') {
    const assigned = await prisma.projectAgent.findUnique({
      where: { projectId_agentId: { projectId: boundary.id, agentId } },
      select: { agentId: true },
    })
    if (!assigned) return notAssigned(agent.name, boundary.name)
  }
  // The agent's own permissions with the boundary's override on top, the strictest winning: what a run there gets.
  const permissions = asCapabilityPermissions(await runPermissions(agent, boundary as OverrideBoundary))
  // Read by the tool's own name: run_task, the start-work group's other tool, is always injected and can never be
  // turned off, so start_work is off only where a list sets start_work itself to Never.
  if (turnToolState(permissions, tool) === 'never') {
    return tool === 'start_work'
      ? `${agent.name} isn't allowed to start work in ${boundary.name}`
      : `${agent.name} isn't allowed to use ${tool} in ${boundary.name}`
  }
  return null
}

export const admitToBoundary: AdmitToBoundary = async ({ personId, agentId, boundary, tool }) => {
  const reason = (await memberRefusal(personId, boundary)) ?? (await agentRefusal(agentId, boundary, tool))
  return reason ? { ok: false, reason } : { ok: true }
}

/** The shared boundaries the agent may start work in for this person now. */
export async function admittedBoundaries(personId: string, agentId: string, tool = 'start_work'): Promise<SharedBoundary[]> {
  const shared = await sharedBoundaries(personId, agentId)
  const admitted = await Promise.all(
    shared.map(async boundary => ((await admitToBoundary({ personId, agentId, boundary, tool })).ok ? boundary : null)),
  )
  return admitted.filter((b): b is SharedBoundary => b !== null)
}
