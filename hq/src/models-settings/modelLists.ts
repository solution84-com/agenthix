/**
 * An allow and ban list, read and written for its owner (models from one place, part 4): the organisation's, an
 * agent's, a project's or a person's. Who may change it is decided here, on the server, whatever the screen showed:
 * organisation admins the organisation's and the agents'; a project's admins a shared project's; a person their own.
 * A personal project has no list of its own: its person's applies.
 */
import { HttpError, prisma } from 'wasp/server'
import {
  MODEL_LIST_EFFECTS, MODEL_LIST_MODES, MODEL_LIST_OWNERS, MODEL_LIST_PATTERN_MAX, providerTypesOf,
  type ModelListEntry, type ModelListMode, type ModelListOwner,
} from '@agenthix/core'
import { isOrgAdmin, projectRole } from '../projects/membership'
import type { AppliedList } from '../routing/listMatch'
import { routeProviders } from '../routing/snapshot'
import { cleanPattern, countAllowed, dedupeEntries, reachableModels, viewEntries } from './coverage'
import type { ListView, ReachableModel } from './types'

export const ENTRIES_MAX = 500

export type ListRef = { owner: ModelListOwner; ownerId: string }

const ONLY_ADMINS = 'Only an organisation admin changes this list.'

export function parseRef(args: unknown): ListRef {
  const a = args as { owner?: unknown; ownerId?: unknown } | undefined
  if (typeof a?.owner !== 'string' || !(MODEL_LIST_OWNERS as readonly string[]).includes(a.owner)) throw new HttpError(400, 'Whose list?')
  if (typeof a.ownerId !== 'string' || !a.ownerId) throw new HttpError(400, 'Whose list?')
  return { owner: a.owner as ModelListOwner, ownerId: a.ownerId }
}

/** Refuses anyone who may not change the list, and a list that has no owner. */
export async function requireMayEditList(ref: ListRef, userId: string): Promise<void> {
  if (ref.owner === 'person') {
    if (ref.ownerId !== userId) throw new HttpError(403, 'A list of your own models is yours alone to change.')
    return
  }
  if (ref.owner === 'project') {
    const project = await prisma.project.findUnique({ where: { id: ref.ownerId }, select: { personalOwnerId: true } })
    if (!project) throw new HttpError(404, 'That project is gone')
    if (project.personalOwnerId) throw new HttpError(409, "A personal project has no list of its own: its owner's applies.")
    if ((await projectRole(ref.ownerId, userId)) !== 'ADMIN') throw new HttpError(403, 'Only a project admin changes the models a project may use.')
    return
  }
  if (!(await isOrgAdmin(userId))) throw new HttpError(403, ONLY_ADMINS)
  if (ref.owner === 'agent') {
    if (!(await prisma.agent.findUnique({ where: { id: ref.ownerId }, select: { id: true } }))) throw new HttpError(404, 'That agent is gone')
    return
  }
  const org = await prisma.org.findFirst({ select: { id: true } })
  if (!org || org.id !== ref.ownerId) throw new HttpError(404, 'That organisation is gone')
}

export async function orgId(): Promise<string> {
  const org = await prisma.org.findFirst({ select: { id: true } })
  if (!org) throw new HttpError(404, 'This HQ has no organisation yet')
  return org.id
}

/** The organisation's providers' models: what every list's entries are counted against. */
export async function reachableByOrg(): Promise<ReachableModel[]> {
  const providers = (await routeProviders(null)).filter(p => providerTypesOf(p.vendor).includes('llm'))
  return reachableModels(providers)
}

async function readList(ref: ListRef): Promise<AppliedList> {
  const row = await prisma.modelList.findUnique({
    where: { owner_ownerId: ref },
    select: { mode: true, entries: { select: { effect: true, pattern: true }, orderBy: { pattern: 'asc' } } },
  })
  return row ?? { mode: 'every', entries: [] }
}

/** A list with what its entries cover and what it leaves; the lists above it are the organisation's. */
export async function listView(ref: ListRef, reachable: readonly ReachableModel[]): Promise<ListView> {
  const list = await readList(ref)
  const above = ref.owner === 'organisation' ? [] : [await readList({ owner: 'organisation', ownerId: await orgId() })]
  return {
    ...ref, mode: list.mode, entries: viewEntries(list.entries, reachable), reachable: reachable.length,
    allowedAbove: countAllowed(above, reachable), allowed: countAllowed([...above, list], reachable),
  }
}

export type ListInput = { mode: ModelListMode; entries: ModelListEntry[] }

export function parseListInput(args: unknown): ListInput {
  const a = args as { mode?: unknown; entries?: unknown } | undefined
  if (typeof a?.mode !== 'string' || !(MODEL_LIST_MODES as readonly string[]).includes(a.mode)) throw new HttpError(400, 'Choose which mode the list is in')
  if (!Array.isArray(a.entries) || a.entries.length > ENTRIES_MAX) throw new HttpError(400, `A list holds at most ${ENTRIES_MAX} entries`)
  const entries: ModelListEntry[] = a.entries.map(raw => {
    const e = raw as { effect?: unknown; pattern?: unknown }
    const pattern = cleanPattern(e?.pattern, MODEL_LIST_PATTERN_MAX)
    if (!pattern || typeof e?.effect !== 'string' || !(MODEL_LIST_EFFECTS as readonly string[]).includes(e.effect)) {
      throw new HttpError(400, `An entry is a model or a pattern of one word, up to ${MODEL_LIST_PATTERN_MAX} characters`)
    }
    return { effect: e.effect as ModelListEntry['effect'], pattern }
  })
  return { mode: a.mode as ModelListMode, entries: dedupeEntries(entries) }
}

/** Replaces a list. A list that lets everything through is removed rather than kept empty. */
export async function saveList(ref: ListRef, input: ListInput, userId: string): Promise<void> {
  await prisma.$transaction(async tx => {
    const existing = await tx.modelList.findUnique({ where: { owner_ownerId: ref }, select: { id: true } })
    if (input.mode === 'every' && input.entries.length === 0) {
      if (existing) await tx.modelList.delete({ where: { id: existing.id } })
      return
    }
    const list = existing
      ? await tx.modelList.update({ where: { id: existing.id }, data: { mode: input.mode, updatedById: userId }, select: { id: true } })
      : await tx.modelList.create({ data: { ...ref, mode: input.mode, updatedById: userId }, select: { id: true } })
    await tx.modelListEntry.deleteMany({ where: { listId: list.id } })
    if (input.entries.length > 0) await tx.modelListEntry.createMany({ data: input.entries.map(e => ({ listId: list.id, ...e })) })
  })
}
