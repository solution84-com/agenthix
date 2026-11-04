import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { unchangedSince } from '../unchangedSince'
import { statusText } from '../../cli/statusText'

const INDEX = 'sha256:' + 'a'.repeat(64)
let m: FakeMachine
/** Each tag's platform image, as its index lists it; the running image's index is named by its digest. */
let platforms: Record<string, string>
let asked: string[]

const settings = (version: string, part: string) => ({
  version, installedAt: 'x', name: 'hq-box', address: 'https://hq.acme.example', bind: '127.0.0.1', trustedProxies: 1,
  images: { [part]: `ghcr.io/solution84-com/agenthix-${part}@${INDEX}` },
})

beforeEach(() => {
  m = fakeMachine()
  asked = []
  platforms = { [INDEX]: 'p3', '0.2.3': 'p3', '0.2.2': 'p3', '0.2.1': 'p3', '0.2.0': 'p0', '0.1.9': 'p3', '0.3.0': 'p3' }
  m.ctx.machine = { name: 'hq-box', hostServiceVersion: '0.2.3' }
  m.tags.set('solution84-com/agenthix-hq-server', ['latest', '0.1.9', '0.2.0', '0.2.1', '0.2.2', '0.2.3', '0.2.4-rc.1', '0.3.0'])
  m.tags.set('solution84-com/agenthix-site-server', ['0.2.2', '0.2.3'])
  m.ctx.registryPlatformDigest = async (_repo, ref) => { asked.push(ref); return platforms[ref] ?? null }
  m.ctx.state.writeJson(['hq', 'settings.json'], settings('0.2.3', 'hq-server'))
})
afterEach(() => m.cleanup())

describe('the release an image was first built for @SC-1259', () => {
  it('is the oldest release of the line, newest first, that lists the same platform image, and stops at the first that differs', async () => {
    expect(await unchangedSince(m.ctx)).toEqual({ hq: '0.2.1' })
    // Not 0.1.9 (another line, and never reached), not 0.3.0 (newer), not 0.2.0 (differs: the walk ended there).
    expect(asked).toEqual([INDEX, '0.2.2', '0.2.1', '0.2.0'])
  })

  it('says nothing when the running release is the one that built the image', async () => {
    platforms['0.2.2'] = 'p2'
    expect(await unchangedSince(m.ctx)).toEqual({})
  })

  it('is asked once per part and version, and kept in the state folder', async () => {
    await unchangedSince(m.ctx)
    asked.length = 0
    m.ctx.registryPlatformDigest = async () => { throw new Error('asked again') }
    expect(await unchangedSince(m.ctx)).toEqual({ hq: '0.2.1' })
    expect(m.ctx.state.readJson('unchanged-since.json')).toEqual({ 'hq-server@0.2.3': '0.2.1' })
  })

  it('keeps an answer of no earlier release too, so it is not asked again', async () => {
    platforms['0.2.2'] = 'p2'
    await unchangedSince(m.ctx)
    expect(m.ctx.state.readJson('unchanged-since.json')).toEqual({ 'hq-server@0.2.3': null })
  })

  it('leaves the line out, keeps nothing and does not fail when the registry cannot be read', async () => {
    m.registryDown.reason = 'getaddrinfo ENOTFOUND ghcr.io'
    expect(await unchangedSince(m.ctx)).toEqual({})
    m.registryDown.reason = null
    m.ctx.registryPlatformDigest = async () => { throw new Error('the registry could not be asked just now') }
    expect(await unchangedSince(m.ctx)).toEqual({})
    expect(m.ctx.state.readJson('unchanged-since.json')).toEqual({})
  })

  it('does not ask a registry that failed again for a few minutes, and stops the request that ran out of time', async () => {
    let calls = 0
    let signal: AbortSignal | undefined
    m.ctx.registryPlatformDigest = async (_repo, _ref, s) => { calls++; signal = s; throw new Error('timed out') }
    await unchangedSince(m.ctx)
    await unchangedSince(m.ctx)
    expect(calls).toBe(1)
    expect(signal?.aborted).toBe(true)
    const later = m.ctx.now().getTime() + 6 * 60_000
    m.ctx.now = () => new Date(later)
    await unchangedSince(m.ctx)
    expect(calls).toBe(2)
  })

  it('says nothing for a development build, an image that is not pinned by digest, or a version that is not a release', async () => {
    m.ctx.machine = { name: 'hq-box', hostServiceVersion: 'dev' }
    expect(await unchangedSince(m.ctx)).toEqual({})
    m.ctx.machine = { name: 'hq-box', hostServiceVersion: '0.2.3' }
    m.ctx.state.writeJson(['hq', 'settings.json'], { ...settings('0.2.3', 'hq-server'), images: { 'hq-server': 'agenthix-hq-server' } })
    expect(await unchangedSince(m.ctx)).toEqual({})
    m.ctx.state.writeJson(['hq', 'settings.json'], settings('0.2.4-rc.1', 'hq-server'))
    expect(await unchangedSince(m.ctx)).toEqual({})
  })

  it('works out the site separately', async () => {
    m.ctx.state.writeJson(['site', 'settings.json'], settings('0.2.3', 'site-server'))
    expect(await unchangedSince(m.ctx)).toEqual({ hq: '0.2.1', site: '0.2.2' })
  })
})

describe('the words in status @SC-1259', () => {
  const status = {
    machine: { name: 'hq-box', hostServiceVersion: '0.2.3' },
    hq: { address: 'https://hq.acme.example', version: '0.2.3', listen: { bind: '127.0.0.1', port: 7800 }, containers: 'running' as const, answer: { users: 2, runningAgents: 1 } },
    site: null,
  }
  it('follow the version with when the image was first built, and add nothing otherwise', () => {
    expect(statusText({ ...status, unchangedSince: { hq: '0.2.1' } })).toContain('HQ  https://hq.acme.example  0.2.3, unchanged since 0.2.1')
    expect(statusText(status)).toContain('HQ  https://hq.acme.example  0.2.3\n')
  })
})
