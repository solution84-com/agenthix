/**
 * Which agents have an asset (spec part 2 *Which agents have it*, D23; R7): every agent, or the agents chosen
 * (`AssetGrant`). There are no per-agent exceptions to an every-agent skill. Removing an asset names the agents that
 * have it and asks first, then marks it removed; its grants, versions and content stay, so the agents' pages can show
 * it as missing and it can be installed again.
 */
import type { PrismaClient } from '@prisma/client'
import type { Db } from '../../packages/packageStore'
import type { Actor } from '../policy'
import { LifecycleError } from './errors'
import { assertLibrary, byOf, identityOf, librarySkill } from './records'

const NOTHING = 'Nothing was changed.'
const MAX_AGENTS_AT_ONCE = 200

export type Holders = { everyAgent: boolean; agents: { id: string; name: string }[] }

export async function holdersOf(db: Db, assetId: unknown): Promise<Holders> {
  const asset = await librarySkill(db, assetId)
  if (asset.givenToAll) {
    return { everyAgent: true, agents: await db.agent.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }) }
  }
  const grants = await db.assetGrant.findMany({ where: { assetId: asset.id }, select: { agent: { select: { id: true, name: true } } } })
  return { everyAgent: false, agents: grants.map(g => g.agent).sort((a, b) => a.name.localeCompare(b.name)) }
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

/** *Remove*: names the agents that have it and asks first; confirmed, it is marked removed. */
export async function removeAsset(db: PrismaClient, actor: Actor, input: { assetId: unknown; confirmed?: unknown }, now: Date): Promise<RemoveResult> {
  await assertLibrary(actor, 'remove', db)
  const by = byOf(actor)
  const asset = await librarySkill(db, input.assetId)
  if (asset.builtIn) throw new LifecycleError(`Built-in skills are switched off, not removed. ${NOTHING}`, 409)
  const holders = await holdersOf(db, asset.id)
  if (input.confirmed !== true && holders.agents.length > 0) {
    const who = holders.everyAgent ? 'Every agent has it' : `${holders.agents.map(a => a.name).join(', ')} ${holders.agents.length === 1 ? 'has' : 'have'} it`
    return { removed: false, confirm: `${who}. Removing ${identityOf(asset)} takes it from them; their pages will show it as missing.`, holders }
  }
  const { count } = await db.asset.updateMany({ where: { id: asset.id, removedAt: null }, data: { removedAt: now, removedById: by.byId } })
  if (count === 0) throw new LifecycleError(`That isn't in the Library. ${NOTHING}`, 404)
  return { removed: true }
}
