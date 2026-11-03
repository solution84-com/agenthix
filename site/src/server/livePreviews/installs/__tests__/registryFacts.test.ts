import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NPM_DOWNLOADS_URL, NPM_REGISTRY_URL, OSV_QUERY_URL, fetchPackageFacts, forgetPackageFacts, packageFacts, readRegistryDocument, type FetchLike } from '../registryFacts'

const doc = {
  time: { created: '2020-01-01T00:00:00Z', '1.0.0': '2026-01-01T00:00:00Z', '1.1.0': '2026-10-27T00:00:00Z', '0.9.0': '2025-01-01T00:00:00Z' },
  versions: { '0.9.0': { _npmUser: { name: 'ana' } }, '1.0.0': { _npmUser: { name: 'ana' } }, '1.1.0': { _npmUser: { name: 'bo' } } },
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function registry(over: Partial<Record<'doc' | 'downloads' | 'osv', () => Response | Promise<Response>>> = {}): FetchLike {
  return vi.fn(async (url: string) => {
    if (url.startsWith(NPM_DOWNLOADS_URL)) return (over.downloads ?? (() => json({ downloads: 40 })))()
    if (url === OSV_QUERY_URL) return (over.osv ?? (() => json({})))()
    if (url.startsWith(NPM_REGISTRY_URL)) return (over.doc ?? (() => json(doc)))()
    throw new Error(`unexpected ${url}`)
  })
}

beforeEach(() => forgetPackageFacts())

describe('the registry’s facts about a package version @SC-1744', () => {
  it('reads when it was published, by whom, and who published the version before', () => {
    expect(readRegistryDocument(doc, '1.1.0')).toEqual({ publishedAt: '2026-10-27T00:00:00Z', publisher: 'bo', previousPublisher: 'ana' })
    expect(readRegistryDocument(doc, '0.9.0')).toEqual({ publishedAt: '2025-01-01T00:00:00Z', publisher: 'ana', previousPublisher: undefined })
    expect(readRegistryDocument(doc, '2.0.0')).toEqual({ publishedAt: null, publisher: null, previousPublisher: null })
    expect(readRegistryDocument(null, '1.0.0')).toEqual({ publishedAt: null, publisher: null, previousPublisher: null })
  })

  it('asks the registry, npm’s download counts and OSV', async () => {
    const fetchFn = registry({ osv: () => json({ vulns: [{ id: 'GHSA-1' }, { id: 'MAL-2' }] }) })
    expect(await fetchPackageFacts(fetchFn, '@acme/x', '1.1.0')).toEqual({
      ecosystem: 'npm', name: '@acme/x', version: '1.1.0', publishedAt: '2026-10-27T00:00:00Z', publisher: 'bo', previousPublisher: 'ana',
      weeklyDownloads: 40, advisories: ['GHSA-1', 'MAL-2'],
    })
    expect(vi.mocked(fetchFn).mock.calls[0][0]).toBe(`${NPM_REGISTRY_URL}/@acme%2fx`)
    const osv = vi.mocked(fetchFn).mock.calls.find(c => c[0] === OSV_QUERY_URL)!
    expect(JSON.parse(String(osv[1]!.body))).toEqual({ version: '1.1.0', package: { name: '@acme/x', ecosystem: 'npm' } })
  })

  it('is null when the registry cannot be reached, so the rule cannot run', async () => {
    expect(await fetchPackageFacts(registry({ doc: () => { throw new TypeError('fetch failed') } }), 'x', '1.0.0')).toBeNull()
    expect(await fetchPackageFacts(registry({ doc: () => json({}, 503) }), 'x', '1.0.0')).toBeNull()
  })

  it('gives null facts for a package the registry does not hold, and for a lookup that failed', async () => {
    const facts = await fetchPackageFacts(registry({ doc: () => json({}, 404), downloads: () => { throw new Error('down') }, osv: () => json({}, 500) }), 'x', '1.0.0')
    expect(facts).toMatchObject({ publishedAt: null, weeklyDownloads: null, advisories: null })
  })

  it('does not read a document larger than its cap', async () => {
    const big = () => new Response('{}', { headers: { 'content-length': String(200 * 1024 * 1024) } })
    expect(await fetchPackageFacts(registry({ doc: big }), 'x', '1.0.0')).toBeNull()
  })

  it('looks each version up once, and asks again after a lookup that failed', async () => {
    const fetchFn = registry()
    await packageFacts('x', '1.0.0', fetchFn)
    await packageFacts('x', '1.0.0', fetchFn)
    expect(vi.mocked(fetchFn).mock.calls.filter(c => String(c[0]).startsWith(NPM_REGISTRY_URL))).toHaveLength(1)
    const failing = registry({ osv: () => json({}, 500) })
    await packageFacts('y', '1.0.0', failing)
    await packageFacts('y', '1.0.0', failing)
    expect(vi.mocked(failing).mock.calls.filter(c => String(c[0]).startsWith(NPM_REGISTRY_URL))).toHaveLength(2)
  })
})
