/**
 * A boundary's hq-held narrowing of an agent (adr-0072): a project's, for runs in it, or a person's own, for runs
 * in their Chat. It holds the agent's own shapes — approval, a state per tool and bash patterns — and only ever
 * takes away: for each tool, pattern and approval the strictest level wins (permissions/effectivePermissions.ts). hq
 * decides what a run may do before it starts. Which models may run is the lists' (models from one place, part 4):
 * a boundary no longer overrides an agent's model, and `model` always reads null.
 */
import { prisma } from 'wasp/server'
import { Prisma } from '@prisma/client'
import {
  isApproval, type AgentConfigPayload, type Approval, type BashPatternPermission, type ToolPermission, type ToolPermissionState,
} from '@agenthix/core'
import { resolvePrimaryLocation, type SessionLocationFields } from '../../storage/primaryLocationService'
import { taskRunOwner } from '../../projects/personalProject'
import { resolveEffectivePermissions, type EffectivePermissions, type OrganisationPermissions } from '../permissions/effectivePermissions'

export type OverrideBoundary = { type: 'project' | 'user'; id: string }
export type AgentOverrideValues = {
  /** Always null: kept so the screens that read a narrowing keep their shape. */
  model: null
  approval: Approval | null
  allowedTools: ToolPermission[] | null
  allowedBashPatterns: BashPatternPermission[] | null
}

export class OverrideValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'OverrideValidationError' }
}

export const MAX_OVERRIDE_TOOLS = 200
export const MAX_OVERRIDE_PATTERNS = 100
const MAX_NAME_LENGTH = 200
const STATES: readonly ToolPermissionState[] = ['always', 'ask', 'never']
const isState = (v: unknown): v is ToolPermissionState => typeof v === 'string' && (STATES as readonly string[]).includes(v)

/**
 * The boundary a run acts in (spec §6.3). A task-anchored session acts for the
 * task's CURRENT project — or, in a personal project, for its person — resolved fresh here rather
 * than trusting the session's stored owner, which goes stale once a task
 * moves projects. Both the capability mint (capabilityService.ts) and the
 * dispatch payload (dispatchService.ts's `buildContext`) call this same
 * function against the same session, which is what keeps the permissions and
 * the model in agreement on both sides. Any other session acts for its own
 * primary location. A session whose task no longer exists has no boundary at
 * all.
 */
export async function runBoundary(session: SessionLocationFields): Promise<OverrideBoundary | null> {
  if (session.taskId) {
    // A task in a personal project acts as its person, in their own storage;
    // any other task as its project (personalProject.ts, spec §4).
    const owner = await taskRunOwner(session.taskId)
    // Fail closed: a session anchored to a task whose row is gone must not
    // present as a person's or a project's boundary from its own stored location.
    return owner ? { type: owner.ownerType, id: owner.ownerId } : null
  }
  const location = resolvePrimaryLocation(session)
  return { type: location.ownerType, id: location.ownerId }
}

/**
 * A list of `{ <key>, state }` entries, or null. A repeated name keeps its last state rather than being refused:
 * an editor that appends a change is easy to write. An empty list is no narrowing.
 */
function validateEntries<K extends 'name' | 'pattern'>(
  raw: unknown, key: K, what: string, max: number,
): Array<Record<K, string> & { state: ToolPermissionState }> | null {
  if (raw === null || raw === undefined) return null
  if (!Array.isArray(raw)) throw new OverrideValidationError(`The ${what} must be a list`)
  const byKey = new Map<string, ToolPermissionState>()
  for (const entry of raw) {
    const e = (entry ?? {}) as Record<string, unknown>
    const value = typeof e[key] === 'string' ? (e[key] as string).trim() : ''
    if (value === '' || value.length > MAX_NAME_LENGTH) throw new OverrideValidationError(`Each of the ${what} needs a ${key} of 1 to ${MAX_NAME_LENGTH} characters`)
    if (!isState(e.state)) throw new OverrideValidationError(`'${String(e.state)}' is not Always, Ask or Never`)
    byKey.delete(value)
    byKey.set(value, e.state)
  }
  if (byKey.size > max) throw new OverrideValidationError(`At most ${max} ${what}`)
  if (byKey.size === 0) return null
  return [...byKey].map(([value, state]) => ({ [key]: value, state }) as Record<K, string> & { state: ToolPermissionState })
}

export function validateOverride(values: unknown): AgentOverrideValues {
  const v = (values ?? {}) as Record<string, unknown>
  const approval = v.approval ?? null
  if (approval !== null && !isApproval(approval)) {
    throw new OverrideValidationError(`'${String(approval)}' is not an approval — bypassed, deferred or immediate`)
  }
  return {
    model: null,
    approval: approval as Approval | null,
    allowedTools: validateEntries(v.allowedTools, 'name', 'tools', MAX_OVERRIDE_TOOLS) as ToolPermission[] | null,
    allowedBashPatterns: validateEntries(v.allowedBashPatterns, 'pattern', 'bash patterns', MAX_OVERRIDE_PATTERNS) as BashPatternPermission[] | null,
  }
}

/** A stored narrowing, read back. A malformed stored list reads as none rather than failing a run's start. */
export function overrideFromRow(row: { approval: string | null; allowedTools: unknown; allowedBashPatterns: unknown }): AgentOverrideValues {
  const safe = <T>(read: () => T): T | null => { try { return read() } catch { return null } }
  return {
    model: null,
    approval: isApproval(row.approval) ? row.approval : null,
    allowedTools: safe(() => validateEntries(row.allowedTools, 'name', 'tools', Infinity)) as ToolPermission[] | null,
    allowedBashPatterns: safe(() => validateEntries(row.allowedBashPatterns, 'pattern', 'bash patterns', Infinity)) as BashPatternPermission[] | null,
  }
}

/** Whether a narrowing sets anything at all. */
export function narrowsAnything(n: AgentOverrideValues | null): boolean {
  return !!n && (n.approval !== null || n.allowedTools !== null || n.allowedBashPatterns !== null)
}

const where = (boundary: OverrideBoundary, agentId: string) => ({
  boundaryType: boundary.type, boundaryId: boundary.id, agentId,
})

export async function getAgentOverride(boundary: OverrideBoundary, agentId: string): Promise<AgentOverrideValues | null> {
  const row = await prisma.agentOverride.findUnique({ where: { boundaryType_boundaryId_agentId: where(boundary, agentId) } })
  return row ? overrideFromRow(row) : null
}

export async function setAgentOverride(
  boundary: OverrideBoundary,
  agentId: string,
  values: unknown,
  updatedById: string,
): Promise<AgentOverrideValues | null> {
  const valid = validateOverride(values)
  if (!narrowsAnything(valid)) {
    await prisma.agentOverride.deleteMany({ where: where(boundary, agentId) })
    return null
  }
  const json = (v: unknown[] | null) => (v === null ? Prisma.JsonNull : (v as Prisma.InputJsonValue))
  const data = {
    approval: valid.approval,
    allowedTools: json(valid.allowedTools),
    allowedBashPatterns: json(valid.allowedBashPatterns),
    updatedById,
  }
  await prisma.agentOverride.upsert({
    where: { boundaryType_boundaryId_agentId: where(boundary, agentId) },
    create: { ...where(boundary, agentId), ...data },
    update: data,
  })
  return valid
}

/** The agent's own permissions, read off its row; an approval that is not one of the three counts as deferred. */
export function organisationPermissions(agent: { approval?: string | null; allowedTools: unknown; allowedBashPatterns: unknown }): OrganisationPermissions {
  return {
    approval: isApproval(agent.approval) ? agent.approval : 'deferred',
    allowedTools: agent.allowedTools,
    allowedBashPatterns: agent.allowedBashPatterns,
  }
}

/**
 * What a run in this boundary may do: the agent's own permissions with the boundary's narrowing on top, the
 * strictest level winning. A project's narrowing applies to a run in that project and a person's to a run in their
 * own storage — `runBoundary` decides which, so a person's never reaches a project run and a project's never a Chat.
 */
export async function runPermissions(
  agent: { id: string; approval?: string | null; allowedTools: unknown; allowedBashPatterns: unknown },
  boundary: OverrideBoundary | null,
): Promise<EffectivePermissions> {
  const override = boundary ? await getAgentOverride(boundary, agent.id) : null
  return resolveEffectivePermissions(organisationPermissions(agent), override)
}

/**
 * The agent row a run in this boundary is dispatched with: the run's effective approval,
 * tools and bash patterns — the same resolution its capability is minted from, so the run's approved tools are
 * built from what this boundary allows.
 */
export async function applyBoundaryOverride(agent: AgentConfigPayload, boundary: OverrideBoundary | null): Promise<AgentConfigPayload> {
  if (!boundary) return agent
  const override = await getAgentOverride(boundary, agent.id)
  if (!override) return agent
  const effective = resolveEffectivePermissions(organisationPermissions(agent), override)
  return {
    ...agent,
    approval: effective.approval,
    allowedTools: effective.allowedTools,
    allowedBashPatterns: effective.allowedBashPatterns,
  }
}
