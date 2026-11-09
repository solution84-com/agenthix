/**
 * The models Inworld lists, kept in memory per provider (adr-0183), the way hq's other live catalogues are: nothing is
 * stored in the database, a list is read again on a schedule and whenever a provider is added or its key replaced
 * (`inworldModelsRefresh.ts`), and a failed read leaves the last good list in place. Until a provider has a list it
 * reaches no models, which is not an outage: `listState` says why.
 *
 * Only a refresh puts a list here, and a refresh clears them all while `inworldLanguageModels` is off, so nothing
 * about the flag has to be asked on every read.
 */
import { inworldPriceRef, inworldPricesMicros, type InworldModel, type PriceRef, type TokenPricesMicros } from '@agenthix/core'

export type InworldList = { models: readonly InworldModel[]; byId: ReadonlyMap<string, InworldModel>; readAt: Date }

const lists = new Map<string, InworldList>()
let version = 0
let merged: { at: number; models: readonly InworldModel[]; ref: PriceRef } | null = null

export function setInworldList(providerId: string, models: readonly InworldModel[], readAt: Date = new Date()): void {
  lists.set(providerId, { models, byId: new Map(models.map(m => [m.id, m])), readAt })
  version++
}

export function dropInworldList(providerId: string): void {
  if (lists.delete(providerId)) version++
}

export function inworldListIds(): string[] {
  return [...lists.keys()]
}

export function clearInworldLists(): void {
  if (lists.size === 0) return
  lists.clear()
  version++
}

export function inworldListOf(providerId: string): InworldList | null {
  return lists.get(providerId) ?? null
}

/** Why a provider reaches no model yet; null when it has a list. */
export function inworldListState(providerId: string): 'not_read_yet' | null {
  return lists.has(providerId) ? null : 'not_read_yet'
}

/** Every Inworld model hq holds, once each, in the order the lists give them (the oldest provider's first). */
function held(): NonNullable<typeof merged> {
  let cached = merged
  if (!cached || cached.at !== version) {
    const seen = new Map<string, InworldModel>()
    for (const list of lists.values()) for (const m of list.models) if (!seen.has(m.id)) seen.set(m.id, m)
    const models = [...seen.values()]
    cached = merged = { at: version, models, ref: inworldPriceRef(models) }
  }
  return cached
}
export const allInworldModels = (): readonly InworldModel[] => held().models

export function inworldModelById(id: string): InworldModel | null {
  for (const list of lists.values()) {
    const m = list.byId.get(id)
    if (m) return m
  }
  return null
}

/** A model's prices from the list held, or null when no list has it or it has no price: an unknown cost, never zero. */
export function inworldPricesOf(id: string): TokenPricesMicros | null {
  const m = inworldModelById(id)
  return m ? inworldPricesMicros(m) : null
}

/** The price source the ledger is given: the list held now, with the reference a row names it by. */
export function inworldPriceSource(): { ref: PriceRef; prices: (id: string) => TokenPricesMicros | null } | null {
  const { models, ref } = held()
  return models.length === 0 ? null : { ref, prices: inworldPricesOf }
}
