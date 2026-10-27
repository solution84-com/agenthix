/**
 * hq's public key set, as core's ticket verifier takes it: fetched from hq's `HQ_JWKS_PATH` (the same address
 * `identity/verifyHqToken.ts` uses), cached, and fetched again when a ticket names a key the cache lacks — hq's key
 * rotation. A refetch is allowed at most once per cooldown, so a stream of tickets naming a made-up key id cannot make
 * this site hammer hq.
 */
import { prisma } from '#db'
import { HQ_JWKS_PATH, type JsonWebKeySet } from '@agenthix/core'

const CACHE_MS = 10 * 60_000
const REFETCH_COOLDOWN_MS = 30_000
const FETCH_TIMEOUT_MS = 10_000

export type KeySetSource = {
  get(): Promise<JsonWebKeySet>
  /** Fetches again unless it did so within the cooldown; answers whether the set may have changed. */
  refresh(): Promise<boolean>
}

async function jwksUrl(): Promise<string> {
  const conn = await prisma.hqConnection.findFirst()
  const hqUrl = conn?.hqUrl || process.env.HQ_URL
  if (!hqUrl) throw new Error('No hq address is configured to fetch its key set from')
  return new URL(HQ_JWKS_PATH, hqUrl).toString()
}

function isKeySet(v: unknown): v is JsonWebKeySet {
  return typeof v === 'object' && v !== null && Array.isArray((v as { keys?: unknown }).keys)
}

export function createHqKeySet(
  fetchSet: () => Promise<JsonWebKeySet> = defaultFetch,
  now: () => number = Date.now,
): KeySetSource {
  let cached: { set: JsonWebKeySet; at: number } | null = null
  let lastFetchAt = -Infinity
  let inFlight: Promise<JsonWebKeySet> | null = null

  const load = (): Promise<JsonWebKeySet> => {
    if (!inFlight) {
      lastFetchAt = now()
      inFlight = fetchSet()
        .then(set => {
          cached = { set, at: now() }
          return set
        })
        .finally(() => {
          inFlight = null
        })
    }
    return inFlight
  }

  return {
    async get() {
      if (cached && now() - cached.at < CACHE_MS) return cached.set
      return load()
    },
    async refresh() {
      if (now() - lastFetchAt < REFETCH_COOLDOWN_MS) return false
      await load()
      return true
    },
  }
}

async function defaultFetch(): Promise<JsonWebKeySet> {
  const res = await fetch(await jwksUrl(), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`hq answered its key set with HTTP ${res.status}`)
  const body: unknown = await res.json()
  if (!isKeySet(body)) throw new Error('hq answered its key set with something that is not one')
  return body
}

export const hqKeySet = createHqKeySet()
