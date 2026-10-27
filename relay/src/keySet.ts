/**
 * hq's public keys, fetched from `HQ_JWKS_PATH` on hq's address and kept until a pass names a key they do not hold.
 * A refetch is made at most once a `MIN_REFETCH_MS`, so a dialler presenting made-up key ids cannot make the relay
 * hammer hq; concurrent callers share one fetch.
 */
import { HQ_JWKS_PATH, type JsonWebKeySet } from '@agenthix/core'

export const MIN_REFETCH_MS = 30_000
const FETCH_TIMEOUT_MS = 10_000

export type FetchKeys = () => Promise<JsonWebKeySet>

export function fetchKeysFrom(hqAddress: string): FetchKeys {
  const url = new URL(HQ_JWKS_PATH, hqAddress).toString()
  return async () => {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'error' })
    if (!res.ok) throw new Error(`hq answered ${res.status} for its key set`)
    const body: unknown = await res.json()
    if (!isKeySet(body)) throw new Error('hq\'s key set is not a key set')
    return body
  }
}

function isKeySet(v: unknown): v is JsonWebKeySet {
  return typeof v === 'object' && v !== null && Array.isArray((v as { keys?: unknown }).keys)
    && (v as { keys: unknown[] }).keys.every(k => typeof k === 'object' && k !== null && typeof (k as { kty?: unknown }).kty === 'string')
}

export class KeySet {
  private keys: JsonWebKeySet | null = null
  private inFlight: Promise<JsonWebKeySet> | null = null
  private lastFetchAt = -Infinity

  constructor(private readonly fetchKeys: FetchKeys, private readonly now: () => number = Date.now) {}

  /** The keys held, fetching them the first time. */
  async current(): Promise<JsonWebKeySet> {
    return this.keys ?? this.fetch()
  }

  /** Fetches again when a token names a key not held; null when the last fetch was too recent to try again. */
  async refetch(): Promise<JsonWebKeySet | null> {
    if (this.inFlight) return this.inFlight
    if (this.now() - this.lastFetchAt < MIN_REFETCH_MS) return null
    return this.fetch()
  }

  private fetch(): Promise<JsonWebKeySet> {
    if (this.inFlight) return this.inFlight
    this.lastFetchAt = this.now()
    this.inFlight = this.fetchKeys()
      .then(keys => {
        this.keys = keys
        return keys
      })
      .finally(() => { this.inFlight = null })
    return this.inFlight
  }
}
