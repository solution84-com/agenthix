/**
 * Reading Inworld's model list with a provider's key and keeping it (`inworldModelStore.ts`): a thin fetch, then core's
 * defensive parser. A list is read again every hour, when a provider is added or its key replaced, and about once a minute for a provider that has none yet (stopping when each has one). The first list a
 * provider gets also fills a default model that could not be chosen before. A failed read (key refused, unreachable, an answer that is not a list) keeps the last good list;
 * with none, the provider reaches no models and `inworldListState` says it has not been read, which is not an outage.
 */
import { parseInworldModels, type InworldModel } from '@agenthix/core'
import { INWORLD_MODELS_URL, inworldLlmAuthorization } from '../shared/inworldLlm'
import { Logger } from '../server/utils/logger'
import { providerStore } from '../providers/store'
import { dropInworldList, inworldListIds, inworldListOf, setInworldList } from './inworldModelStore'

const logger = new Logger('InworldModels')
const TIMEOUT_MS = 15_000
export const INWORLD_REFRESH_MS = 60 * 60_000
export const INWORLD_RETRY_MS = 60_000
/** A list or error body over this is not read (Inworld's list is about 100 KB). */
export const MAX_LIST_BYTES = 2 * 1024 * 1024

export type FetchedList = { ok: true; models: InworldModel[] } | { ok: false; detail: string }
export type ListFetcher = (key: string) => Promise<FetchedList>

/** The body as JSON, read up to the cap: null when it is not JSON, 'too_large' when it passes the cap. */
async function readCapped(res: Response): Promise<unknown | 'too_large'> {
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_LIST_BYTES) return 'too_large'
  const reader = res.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > MAX_LIST_BYTES) {
      await reader.cancel().catch(() => {})
      return 'too_large'
    }
    chunks.push(value)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return null
  }
}

export const fetchInworldModels: ListFetcher = async key => {
  try {
    const res = await fetch(INWORLD_MODELS_URL, {
      headers: { Authorization: inworldLlmAuthorization(key) }, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error',
    })
    if (!res.ok) return { ok: false, detail: `Inworld answered ${res.status}.` }
    const body = await readCapped(res)
    if (body === 'too_large') return { ok: false, detail: 'Inworld\'s answer was too large to read.' }
    const models = parseInworldModels(body)
    return models.length > 0 ? { ok: true, models } : { ok: false, detail: 'Inworld\'s answer held no usable models.' }
  } catch {
    return { ok: false, detail: 'Inworld could not be reached.' }
  }
}

let fetcher: ListFetcher = fetchInworldModels

/** Tests install a fake; `null` puts the real one back. */
export function useInworldListFetcher(fake: ListFetcher | null): void {
  fetcher = fake ?? fetchInworldModels
}

/** Reads one provider's list. Whether a new list is now held: false when the provider is not Inworld's, or the read failed. */
export async function refreshInworldModels(providerId: string): Promise<boolean> {
  const provider = await providerStore().byId(providerId)
  if (!provider || provider.vendor !== 'inworld' || provider.credentialKind !== 'api_key') return false
  const credential = await providerStore().credentialOf(providerId)
  if (!credential?.key) return false
  const result = await fetcher(credential.key)
  if (!result.ok) {
    logger.warn(`Inworld's model list was not read${inworldListOf(providerId) ? ', the last one is kept' : ''}: ${result.detail}`)
    return false
  }
  const first = !inworldListOf(providerId)
  setInworldList(providerId, result.models)
  if (first) await fillDefaultsAfterFirstList()
  return true
}

/** A default model that could not be chosen without a list is chosen now; a failure here never fails the read. */
async function fillDefaultsAfterFirstList(): Promise<void> {
  try {
    // Loaded here: setup's defaults read this module's lists, so a static import would be a cycle.
    await (await import('../setup/setupDefaults')).fillEmptyDefaults()
  } catch (err) {
    logger.warn(`Filling the default models after the first Inworld list failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Reads every Inworld provider's list, and drops a removed provider's. */
export async function refreshAllInworldModels(onlyMissing = false): Promise<void> {
  const providers = await providerStore().list()
  const ids = new Set(providers.filter(p => p.vendor === 'inworld').map(p => p.id))
  for (const id of inworldListIds()) if (!ids.has(id)) dropInworldList(id)
  for (const id of ids) {
    if (onlyMissing && inworldListOf(id)) continue
    try {
      await refreshInworldModels(id)
    } catch (err) {
      logger.warn(`Reading Inworld's model list failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

let lastBackgroundAt = 0
let background: Promise<void> | null = null

/**
 * For a query: starts reading the lists that are missing without waiting for them, and not again within a minute of
 * the last start, so a screen that refetches does not call Inworld each time (a failed read is remembered that way).
 */
export function refreshMissingInBackground(now = Date.now()): void {
  if (background || now - lastBackgroundAt < INWORLD_RETRY_MS) return
  lastBackgroundAt = now
  background = refreshAllInworldModels(true).catch(() => {}).finally(() => { background = null })
}

/** One minute's turn: only the lists still missing are read (none missing, no calls). */
export async function retryInworldModels(): Promise<void> {
  await refreshAllInworldModels(true)
}

let timer: NodeJS.Timeout | null = null
let retryTimer: NodeJS.Timeout | null = null

/** Started once from setup: a first read, one every hour, and a check each minute for a list still missing. */
export function startInworldModelsRefresh(): void {
  if (timer) return
  void refreshAllInworldModels().catch(() => {})
  timer = setInterval(() => void refreshAllInworldModels().catch(() => {}), INWORLD_REFRESH_MS)
  timer.unref()
  retryTimer = setInterval(() => void retryInworldModels().catch(() => {}), INWORLD_RETRY_MS)
  retryTimer.unref()
}
