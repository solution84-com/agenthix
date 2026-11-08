/**
 * Which agents have an asset (spec part 2 *Which agents have it*, D23; R7): every agent, or the agents chosen
 * (`AssetGrant`). There are no per-agent exceptions to an every-agent skill. Removing an asset names the agents that
 * have it and asks first, then marks it removed; its grants, versions and content stay, so the agents' pages can show
 * it as missing and it can be installed again.
 */
import type { PrismaClient } from '@prisma/client'
import { compareSemVer } from '@agenthix/core'
import type { Db } from '../../packages/packageStore'
import type { Actor } from '../policy'
import { LifecycleError } from './errors'
import { moveHolders } from './ownCopy'
import { assertLibrary, byOf, identityOf, libraryAsset, librarySkill } from './records'

const NOTHING = 'Nothing was changed.'
const MAX_AGENTS_AT_ONCE = 200

/** What was made from a template: read-only, and never changed by anything done to the template (adr-0072). */
export type MadeThing = { name: string; version: string }

/** A skill's: every agent or the agents chosen. A template's: nothing has it, but `made` names what was made from it. */
export type Holders = { everyAgent: boolean; agents: { id: string; name: string }[]; made: MadeThing[] }

type MadeRow = { name: string; madeFromVersion: { version: string } | null }

async function madeFrom(db: Db, kind: string, assetId: string): Promise<MadeThing[]> {
  const query = { where: { madeFromVersion: { assetId } }, select: { name: true, madeFromVersion: { select: { version: true } } }, orderBy: { name: 'asc' as const } }
  const rows: MadeRow[] = kind === 'AGENT' ? await db.agent.findMany(query)
    : kind === 'BOARD' ? await db.board.findMany(query)
    : kind === 'TEAM' ? await db.team.findMany(query)
    : []
  if (kind === 'TASK_TEMPLATE') return projectsMadeFrom(db, assetId)
  return rows.map(r => ({ name: r.name, version: r.madeFromVersion?.version ?? '' }))
}

// A task template's types and fields are copied into projects: each project once, at the newest version it took.
async function projectsMadeFrom(db: Db, assetId: string): Promise<MadeThing[]> {
  const query = { where: { madeFromVersion: { assetId } }, select: { project: { select: { name: true } }, madeFromVersion: { select: { version: true } } } }
  const rows = [...await db.taskType.findMany(query), ...await db.customField.findMany(query)]
  const byProject = new Map<string, string>()
  for (const r of rows) {
    const version = r.madeFromVersion?.version
    if (!version) continue
    const held = byProject.get(r.project.name)
    if (held === undefined || compareSemVer(version, held) > 0) byProject.set(r.project.name, version)
  }
  return [...byProject].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([name, version]) => ({ name, version }))
}

export async function holdersOf(db: Db, assetId: unknown): Promise<Holders> {
  const asset = await libraryAsset(db, assetId)
  if (asset.kind !== 'SKILL') return { everyAgent: false, agents: [], made: await madeFrom(db, asset.kind, asset.id) }
  if (asset.givenToAll) {
    return { everyAgent: true, agents: await db.agent.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }), made: [] }
  }
  const grants = await db.assetGrant.findMany({ where: { assetId: asset.id }, select: { agent: { select: { id: true, name: true } } } })
  return { everyAgent: false, agents: grants.map(g => g.agent).sort((a, b) => a.name.localeCompare(b.name)), made: [] }
}

/** Every agent (L2), or only the agents chosen (L3), who keep any grants they had. */
export async function setEveryAgent(db: PrismaClient, actor: Actor, input: { assetId: unknown; everyAgent: unknown }): Promise<Holders> {
  await assertLibrary(actor, 'grant', db)
  byOf(actor)
  const asset = await librarySkill(db, input.assetId)
  if (!asset.currentVersion) throw new LifecycleError(`Publish ${identityOf(asset)} before giving it to agents. ${NOTHING}`, 409)
  await db.asset.update({ where: { id: asset.id }, data: { givenToAll: input.everyAgent === true } })
  return holdersOf(db, asset.id)
}

/** *Add to agents…* */
export async function addToAgents(db: PrismaClient, actor: Actor, input: { assetId: unknown; agentIds: unknown }): Promise<Holders> {
  await assertLibrary(actor, 'grant', db)
  const by = byOf(actor)
  const asset = await librarySkill(db, input.assetId)
  if (!asset.currentVersion) throw new LifecycleError(`Publish ${identityOf(asset)} before giving it to agents. ${NOTHING}`, 409)
  if (asset.givenToAll) throw new LifecycleError(`Every agent already has ${identityOf(asset)}. ${NOTHING}`, 409)
  const ids = Array.isArray(input.agentIds) ? [...new Set(input.agentIds.filter((id): id is string => typeof id === 'string'))] : []
  if (ids.length === 0 || ids.length > MAX_AGENTS_AT_ONCE) throw new LifecycleError(`Choose 1 to ${MAX_AGENTS_AT_ONCE} agents. ${NOTHING}`)
  const found = await db.agent.findMany({ where: { id: { in: ids } }, select: { id: true } })
  if (found.length !== ids.length) throw new LifecycleError(`One of those agents isn't here. ${NOTHING}`, 404)
  await db.assetGrant.createMany({ data: ids.map(agentId => ({ assetId: asset.id, agentId, grantedById: by.byId })), skipDuplicates: true })
  return holdersOf(db, asset.id)
}

/** *Remove from Ada.* Not from an every-agent skill: there are no per-agent exceptions (R7). */
export async function removeFromAgent(db: PrismaClient, actor: Actor, input: { assetId: unknown; agentId: unknown }): Promise<Holders> {
  await assertLibrary(actor, 'grant', db)
  byOf(actor)
  const asset = await librarySkill(db, input.assetId)
  if (asset.givenToAll) {
    throw new LifecycleError(`Every agent has ${identityOf(asset)}, with no exceptions. To take it from one agent, choose the agents that have it instead. ${NOTHING}`, 409)
  }
  if (typeof input.agentId !== 'string') throw new LifecycleError(`Choose the agent. ${NOTHING}`)
  const { count } = await db.assetGrant.deleteMany({ where: { assetId: asset.id, agentId: input.agentId } })
  if (count === 0) throw new LifecycleError(`That agent doesn't have ${identityOf(asset)}. ${NOTHING}`, 404)
  return holdersOf(db, asset.id)
}

export type RemoveResult = { removed: true } | { removed: false; confirm: string; holders: Holders }

/**
 * *Remove*: names what it reaches and asks first; confirmed, it is marked removed. A skill's agents stop using it. A
 * template's agents, boards and teams made from it stay exactly as they are; a removed template of Agenthix's is not
 * installed again when hq starts, until an administrator puts it back.
 */
export async function removeAsset(db: PrismaClient, actor: Actor, input: { assetId: unknown; confirmed?: unknown }, now: Date): Promise<RemoveResult> {
  await assertLibrary(actor, 'remove', db)
  const by = byOf(actor)
  const asset = await libraryAsset(db, input.assetId)
  if (asset.builtIn) throw new LifecycleError(`Built-in skills are switched off, not removed. ${NOTHING}`, 409)
  const holders = await holdersOf(db, asset.id)
  // A copy in use stands in for an original set aside for it: removing the copy gives its agents the original back.
  const original = await db.asset.findFirst({ where: { setAsideById: asset.id, removedAt: null } })
  if (input.confirmed !== true && holders.agents.length > 0) {
    const who = holders.everyAgent ? 'Every agent has it' : `${holders.agents.map(a => a.name).join(', ')} ${holders.agents.length === 1 ? 'has' : 'have'} it`
    const after = original ? `${identityOf(original)} goes back to them in its place.` : 'their pages will show it as missing.'
    return { removed: false, confirm: `${who}. Removing ${identityOf(asset)} takes it from them; ${after}`, holders }
  }
  if (input.confirmed !== true && holders.made.length > 0) {
    const made = holders.made.map(m => m.name).join(', ')
    return { removed: false, confirm: `${made} ${holders.made.length === 1 ? 'was' : 'were'} made from ${identityOf(asset)}. Removing it doesn't change them.`, holders }
  }
  await db.$transaction(async tx => {
    const { count } = await tx.asset.updateMany({ where: { id: asset.id, removedAt: null }, data: { removedAt: now, removedById: by.byId } })
    if (count === 0) throw new LifecycleError(`That isn't in the Library. ${NOTHING}`, 404)
    if (original) {
      await moveHolders(tx, asset, original.id, by.byId)
      await tx.asset.update({ where: { id: original.id }, data: { setAsideById: null } })
    }
  })
  return { removed: true }
}

/** *Put back*: a removed asset back in the Library, as it was. Administrators, as removing is. */
export async function restoreAsset(db: PrismaClient, actor: Actor, input: { assetId: unknown }): Promise<{ identity: string }> {
  await assertLibrary(actor, 'remove', db)
  byOf(actor)
  const asset = typeof input.assetId === 'string' ? await db.asset.findUnique({ where: { id: input.assetId } }) : null
  if (!asset || !asset.removedAt || !asset.currentVersionId) throw new LifecycleError(`That isn't removed from the Library. ${NOTHING}`, 404)
  await db.asset.update({ where: { id: asset.id }, data: { removedAt: null, removedById: null } })
  return { identity: identityOf(asset) }
}
