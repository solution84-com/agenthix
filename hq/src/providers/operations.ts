/**
 * The providers' operations, for organisation admins only (models from one place, part 1; Providers in the admin
 * area). Every one refuses anyone else here, on the server, whatever the page showed; the writes check the role again
 * in `write.ts`. The answers carry no key.
 */
import { HttpError } from 'wasp/server'
import type {
  AddAiProvider, CheckAiProviderNow, GetAiProviderImpact, GetAiProviderRecords, GetAiProviders, RemoveAiProvider,
  RenameAiProvider, ReplaceAiProviderKey, RevokeAiProvider,
} from 'wasp/server/operations'
import { isAiProviderVendor, type AiProviderSummary, type AiProviderVendor, type ProviderActor, type ProviderRecordView } from '@agenthix/core'
import { isOrgAdmin } from '../projects/membership'
import { checkProvider } from './health'
import type { ProviderImpact } from './impact'
import { listProviderSummaries, providerRecords, summaryOf } from './reads'
import { providerStore } from './store'
import {
  ProviderRefusal, addProvider, providerImpact, removeProvider, renameProvider, replaceProviderKey, revokeProvider,
  type RefusalCode, type WrittenProvider,
} from './write'

const ONLY_ADMINS = 'Only an organisation admin manages providers.'

async function asOrgAdmin(context: { user?: { id: string } | null }): Promise<ProviderActor & { kind: 'organisation_admin' }> {
  if (!context.user) throw new HttpError(401)
  if (!(await isOrgAdmin(context.user.id))) throw new HttpError(403, ONLY_ADMINS)
  return { kind: 'organisation_admin', userId: context.user.id }
}

const STATUS: Record<RefusalCode, number> = {
  not_allowed: 403, not_found: 404, conflict: 409, usage: 400, refused_by_vendor: 422, last_of_type: 409,
}

async function answering<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (err) {
    if (err instanceof ProviderRefusal) throw new HttpError(STATUS[err.code], err.message, { code: err.code })
    throw err
  }
}

function idOf(args: unknown): string {
  const id = (args as { id?: unknown } | undefined)?.id
  if (typeof id !== 'string' || !id) throw new HttpError(400, 'Which provider?')
  return id
}

function textOf(args: unknown, field: string): string {
  const v = (args as Record<string, unknown> | undefined)?.[field]
  if (typeof v !== 'string') throw new HttpError(400, `${field} is missing`)
  return v
}

export const getAiProviders: GetAiProviders<void, AiProviderSummary[]> = async (_args, context) => {
  await asOrgAdmin(context)
  return listProviderSummaries()
}

export const getAiProviderRecords: GetAiProviderRecords<{ id: string }, ProviderRecordView[]> = async (args, context) => {
  await asOrgAdmin(context)
  return providerRecords(idOf(args))
}

/** What removing or revoking would touch, shown before the person confirms. */
export const getAiProviderImpact: GetAiProviderImpact<{ id: string }, ProviderImpact> = async (args, context) => {
  await asOrgAdmin(context)
  return answering(() => providerImpact(idOf(args)))
}

type AddArgs = { vendor: AiProviderVendor; key?: string; name?: string; baseUrl?: string }

export const addAiProvider: AddAiProvider<AddArgs, { provider: WrittenProvider }> = async (args, context) => {
  const actor = await asOrgAdmin(context)
  if (!isAiProviderVendor(args?.vendor)) throw new HttpError(400, 'There is no such vendor.')
  return answering(() => addProvider(actor, { vendor: args.vendor, key: args.key ?? null, name: args.name, baseUrl: args.baseUrl ?? null }))
}

export const replaceAiProviderKey: ReplaceAiProviderKey<{ id: string; key: string }, { provider: WrittenProvider }> = async (args, context) => {
  const actor = await asOrgAdmin(context)
  return answering(() => replaceProviderKey(actor, { id: idOf(args), key: textOf(args, 'key') }))
}

export const renameAiProvider: RenameAiProvider<{ id: string; name: string }, { provider: WrittenProvider }> = async (args, context) => {
  const actor = await asOrgAdmin(context)
  return answering(() => renameProvider(actor, { id: idOf(args), name: textOf(args, 'name') }))
}

export const removeAiProvider: RemoveAiProvider<{ id: string }, { impact: ProviderImpact }> = async (args, context) => {
  const actor = await asOrgAdmin(context)
  return answering(() => removeProvider(actor, { id: idOf(args) }))
}

export const revokeAiProvider: RevokeAiProvider<{ id: string }, { impact: ProviderImpact }> = async (args, context) => {
  const actor = await asOrgAdmin(context)
  return answering(() => revokeProvider(actor, { id: idOf(args) }))
}

/** Checks a provider with its vendor now; Agenthix Cloud's state is its answers, so it is read as it is. */
export const checkAiProviderNow: CheckAiProviderNow<{ id: string }, AiProviderSummary> = async (args, context) => {
  await asOrgAdmin(context)
  const id = idOf(args)
  const p = (await checkProvider(id)) ?? (await providerStore().byId(id))
  if (!p) throw new HttpError(404, 'There is no such provider.')
  return summaryOf(p)
}
