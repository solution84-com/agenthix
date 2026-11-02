/**
 * The facts the install-script rule reads (core's `PackageFacts`), from what the public registries publish: the npm
 * registry's document for the package (when each version was published, and by whom), npm's download counts, and
 * the OSV database's advisories. Looked up by the site, never from the live preview, and kept per package version, so each is
 * looked up once while the site runs.
 *
 * The registry's document unreachable (no answer, a timeout, a server error): null, and the rule cannot run, so
 * scripts stay off. A fact the registries do not give is null in the facts, which the rule counts as failing.
 */
import { packageFactsKey, type PackageFacts } from '@agenthix/core'

export const NPM_REGISTRY_URL = 'https://registry.npmjs.org'
export const NPM_DOWNLOADS_URL = 'https://api.npmjs.org/downloads/point/last-week'
export const OSV_QUERY_URL = 'https://api.osv.dev/v1/query'

const LOOKUP_TIMEOUT_MS = 15_000
/** A package's whole document can be large (every version it ever published); beyond this it is not read. */
const DOCUMENT_MAX_BYTES = 64 * 1024 * 1024
const ANSWER_MAX_BYTES = 1024 * 1024
const CACHE_MAX = 5000

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

class Unreachable extends Error {}

async function readCapped(res: Response, max: number): Promise<string> {
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > max) throw new Unreachable('too large')
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel().catch(() => {})
      throw new Unreachable('too large')
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** The answer's status and JSON body; throws `Unreachable` when there is no usable answer at all. */
async function getJson(fetchFn: FetchLike, url: string, max: number, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
  let res: Response
  try {
    res = await fetchFn(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) })
  } catch {
    throw new Unreachable(url)
  }
  if (res.status >= 500 || res.status === 429) throw new Unreachable(`${res.status}`)
  if (res.status !== 200) return { status: res.status, body: null }
  try {
    return { status: 200, body: JSON.parse(await readCapped(res, max)) }
  } catch (err) {
    if (err instanceof Unreachable) throw err
    throw new Unreachable('unreadable')
  }
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null)
const encodeName = (name: string) => name.replace('/', '%2f')

/** Publication time and publisher of `version`, and the publisher of the version published just before it. */
export function readRegistryDocument(doc: unknown, version: string): Pick<PackageFacts, 'publishedAt' | 'publisher' | 'previousPublisher'> {
  const d = obj(doc)
  const time = obj(d?.time) ?? {}
  const versions = obj(d?.versions) ?? {}
  const publisherOf = (v: string): string | null => {
    const user = obj(obj(versions[v])?._npmUser)
    return typeof user?.name === 'string' ? user.name : null
  }
  const published = typeof time[version] === 'string' ? time[version] as string : null
  if (!published || !(version in versions)) return { publishedAt: null, publisher: null, previousPublisher: null }
  const ordered = Object.keys(versions)
    .filter(v => typeof time[v] === 'string' && !Number.isNaN(Date.parse(time[v] as string)))
    .sort((a, b) => Date.parse(time[a] as string) - Date.parse(time[b] as string))
  const at = ordered.indexOf(version)
  const previous = at > 0 ? ordered[at - 1] : undefined
  return { publishedAt: published, publisher: publisherOf(version), previousPublisher: previous === undefined ? undefined : publisherOf(previous) }
}

async function weeklyDownloads(fetchFn: FetchLike, name: string): Promise<number | null> {
  try {
    const { body } = await getJson(fetchFn, `${NPM_DOWNLOADS_URL}/${name}`, ANSWER_MAX_BYTES)
    const n = obj(body)?.downloads
    return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null
  } catch {
    return null
  }
}

async function advisories(fetchFn: FetchLike, name: string, version: string): Promise<string[] | null> {
  try {
    const { status, body } = await getJson(fetchFn, OSV_QUERY_URL, ANSWER_MAX_BYTES, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version, package: { name, ecosystem: 'npm' } }),
    })
    if (status !== 200) return null
    const vulns = obj(body)?.vulns
    if (vulns === undefined) return []
    if (!Array.isArray(vulns)) return null
    return vulns.map(v => obj(v)?.id).filter((id): id is string => typeof id === 'string').slice(0, 100)
  } catch {
    return null
  }
}

/** The facts for one package version, uncached. Null when the registry could not be reached. */
export async function fetchPackageFacts(fetchFn: FetchLike, name: string, version: string): Promise<PackageFacts | null> {
  let doc: { status: number; body: unknown }
  try {
    doc = await getJson(fetchFn, `${NPM_REGISTRY_URL}/${encodeName(name)}`, DOCUMENT_MAX_BYTES, { headers: { accept: 'application/json' } })
  } catch {
    return null
  }
  const [downloads, found] = await Promise.all([weeklyDownloads(fetchFn, name), advisories(fetchFn, name, version)])
  return {
    ecosystem: 'npm', name, version,
    ...readRegistryDocument(doc.body, version),
    weeklyDownloads: downloads,
    advisories: found,
  }
}

const cache = new Map<string, PackageFacts>()

/** The facts, looked up once per package version; an unreachable registry, or a fact missing, is asked again next time. */
export async function packageFacts(name: string, version: string, fetchFn: FetchLike = fetch): Promise<PackageFacts | null> {
  const key = packageFactsKey('npm', name, version)
  const kept = cache.get(key)
  if (kept) return kept
  const facts = await fetchPackageFacts(fetchFn, name, version)
  if (!facts) return null
  // A fact missing may be a lookup that failed this once; only a whole answer is kept.
  if (facts.publishedAt === null || facts.weeklyDownloads === null || facts.advisories === null) return facts
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string)
  cache.set(key, facts)
  return facts
}

export function forgetPackageFacts(): void {
  cache.clear()
}
