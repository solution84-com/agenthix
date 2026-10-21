import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../../server/siteConfig', () => ({ getAgentFacingSiteUrl: () => 'http://site' }))
vi.mock('../../landlockCheck', () => ({ requireLandlock: vi.fn() }))

import { OpenCodeServers } from '../openCodeServers'
import { fakeDeps, json, type Call } from './fakeRelay'
import { containerForServerKey, recordOpenCodeSession, resetOpenCodeTurnsForTests, openCodeSessionEntry } from '../openCodeTurns'
import { OPENCODE_HARNESS, PLATFORM_TOOLS_HARNESS_HEADER } from '../../../../server/mcp/siteTools'
import type { OpenCodeEvent } from '../openCodeEvents'

const C = 'agent-c1'
const connected = (c: Call) => {
  if (c.path.startsWith('/mcp?')) {
    const name = (c.body as { name: string }).name
    return json(200, { [name]: { status: 'connected' } })
  }
  return undefined
}

beforeEach(() => resetOpenCodeTurnsForTests())

describe('the OpenCode server manager', () => {
  it('starts one server per container, untagged, with a password and a key of its own', async () => {
    const { deps, relays } = fakeDeps(connected)
    const servers = new OpenCodeServers(deps)
    await Promise.all([servers.ensureServer(C, null), servers.ensureServer(C, null)])
    await servers.ensureServer(C, null)
    expect(relays).toHaveLength(1)
    expect(relays[0].starts).toHaveLength(1)
    const { argv, env, port } = relays[0].starts[0]
    expect(argv).toEqual(['opencode', 'serve', '--hostname', '127.0.0.1', '--port', '4096'])
    expect(port).toBe(4096)
    expect(env.SITE_SESSION).toBeUndefined()
    expect(env.OPENCODE_SERVER_PASSWORD).toMatch(/^[A-Za-z0-9_-]{40,}$/)
    expect(containerForServerKey(env.SITE_HARNESS_KEY)).toBe(C)
    expect(relays[0].subscriberCount).toBe(1)
  })

  it('waits until the server answers before using it', async () => {
    const { deps, relays } = fakeDeps(connected, { healthyAfter: 3 })
    const servers = new OpenCodeServers(deps)
    await servers.ensureServer(C, null)
    expect(servers.isRunning(C)).toBe(true)
    expect(relays[0].starts).toHaveLength(1)
  })

  it('abandons a probe that gets no answer and asks again, rather than waiting out a long timeout', async () => {
    const { deps, relays } = fakeDeps(connected, { hangFirstHealth: true })
    const servers = new OpenCodeServers(deps)
    const began = Date.now()
    await servers.ensureServer(C, null)
    expect(Date.now() - began).toBeLessThan(1_000)
    expect(relays[0].healthTimeouts.length).toBeGreaterThanOrEqual(2)
    expect(Math.max(...relays[0].healthTimeouts)).toBeLessThanOrEqual(500)
  })

  it('never starts a server where Landlock cannot contain its commands', async () => {
    const { deps, relays } = fakeDeps(connected, { landlock: async () => { throw new Error('Landlock ABI 5') } })
    const servers = new OpenCodeServers(deps)
    await expect(servers.ensureServer(C, null)).rejects.toThrow(/Landlock ABI 5/)
    expect(relays).toHaveLength(0)
  })

  it('forgets the key of a server that failed to start', async () => {
    const { deps, relays } = fakeDeps(connected, { startError: new Error('the harness home holds an OpenCode account') })
    const servers = new OpenCodeServers(deps)
    await expect(servers.ensureServer(C, null)).rejects.toThrow(/account/)
    expect(servers.isRunning(C)).toBe(false)
    expect(relays).toHaveLength(1)
  })

  it('adds a conversation\'s connection once, in its folder, with its own token', async () => {
    const { deps, relays } = fakeDeps(connected)
    const servers = new OpenCodeServers(deps)
    await servers.ensureServer(C, null)
    const conn = { name: 'agxaaa', token: 'tok-1', directory: '/projects/p1/files', url: 'http://site/mcp' }
    await servers.ensureConnection(C, 'conv-a', conn)
    await servers.ensureConnection(C, 'conv-a', conn)
    const adds = relays[0].calls.filter(c => c.path.startsWith('/mcp?'))
    expect(adds).toHaveLength(1)
    expect(adds[0].path).toBe('/mcp?directory=%2Fprojects%2Fp1%2Ffiles')
    expect(adds[0].body).toEqual({
      name: 'agxaaa',
      config: { type: 'remote', url: 'http://site/mcp', headers: { Authorization: 'Bearer tok-1', [PLATFORM_TOOLS_HARNESS_HEADER]: OPENCODE_HARNESS }, oauth: false, enabled: true },
    })
    await servers.ensureConnection(C, 'conv-a', { ...conn, token: 'tok-2' })
    expect(relays[0].calls.filter(c => c.path.startsWith('/mcp?'))).toHaveLength(2)
  })

  it('refuses a connection OpenCode could not connect', async () => {
    const { deps } = fakeDeps(c => (c.path.startsWith('/mcp?') ? json(200, { agxaaa: { status: 'failed', error: 'refused' } }) : undefined))
    const servers = new OpenCodeServers(deps)
    await servers.ensureServer(C, null)
    await expect(servers.ensureConnection(C, 'conv-a', { name: 'agxaaa', token: 't', directory: '/p', url: 'u' })).rejects.toThrow(/could not be connected.*refused/)
  })

  it('refuses two conversations sharing a connection name rather than merging them', async () => {
    const { deps } = fakeDeps(connected)
    const servers = new OpenCodeServers(deps)
    await servers.ensureServer(C, null)
    await servers.ensureConnection(C, 'conv-a', { name: 'agxsame', token: 'a', directory: '/p', url: 'u' })
    await expect(servers.ensureConnection(C, 'conv-b', { name: 'agxsame', token: 'b', directory: '/p', url: 'u' })).rejects.toThrow(/same connection name/)
  })

  it('routes each session\'s events to its own turn only', async () => {
    const { deps, relays } = fakeDeps(connected)
    const servers = new OpenCodeServers(deps)
    await servers.ensureServer(C, null)
    const a: OpenCodeEvent[] = []
    const b: OpenCodeEvent[] = []
    servers.listen(C, 'ses_a', { onEvent: e => a.push(e), onServerStopped: () => {} })
    servers.listen(C, 'ses_b', { onEvent: e => b.push(e), onServerStopped: () => {} })
    relays[0].emit({ type: 'session.idle', properties: { sessionID: 'ses_a' } })
    relays[0].emit({ type: 'plugin.added', properties: {} })
    relays[0].emit({ type: 'session.idle', properties: { sessionID: 'ses_b' } })
    expect(a).toEqual([{ type: 'session.idle', properties: { sessionID: 'ses_a' } }])
    expect(b).toEqual([{ type: 'session.idle', properties: { sessionID: 'ses_b' } }])
  })

  it('after a crash, tells running turns, and the next turn restarts it and adds the connections again', async () => {
    const { deps, relays } = fakeDeps(connected)
    const servers = new OpenCodeServers(deps)
    await servers.ensureServer(C, null)
    const conn = { name: 'agxaaa', token: 't', directory: '/p', url: 'u' }
    await servers.ensureConnection(C, 'conv-a', conn)
    const stopped: string[] = []
    servers.listen(C, 'ses_a', { onEvent: () => {}, onServerStopped: r => stopped.push(r) })
    const firstKey = relays[0].starts[0].env.SITE_HARNESS_KEY

    relays[0].crash()
    expect(stopped).toEqual(['the OpenCode server stopped during the turn'])
    expect(servers.isRunning(C)).toBe(false)
    expect(containerForServerKey(firstKey)).toBeNull()

    await servers.ensureServer(C, null)
    expect(relays[0].starts).toHaveLength(2)
    expect(relays[0].subscriberCount).toBe(1)
    await servers.ensureConnection(C, 'conv-a', conn)
    expect(relays[0].calls.filter(c => c.path.startsWith('/mcp?'))).toHaveLength(2)
    expect(relays[0].starts[1].env.OPENCODE_SERVER_PASSWORD).not.toBe(relays[0].starts[0].env.OPENCODE_SERVER_PASSWORD)
  })

  it('starts a new relay when the container\'s relay has gone', async () => {
    const { deps, relays } = fakeDeps(connected)
    const servers = new OpenCodeServers(deps)
    await servers.ensureServer(C, null)
    relays[0].close()
    expect(servers.isRunning(C)).toBe(false)
    await servers.ensureServer(C, null)
    expect(relays).toHaveLength(2)
  })

  it('keeps the server while any conversation it serves is live, and stops it with the last', async () => {
    const { deps, relays } = fakeDeps(connected)
    const servers = new OpenCodeServers(deps)
    await servers.ensureServer(C, null)
    servers.turnStarted(C, 'conv-a'); servers.turnEnded(C)
    servers.turnStarted(C, 'conv-b'); servers.turnEnded(C)
    await servers.ensureConnection(C, 'conv-a', { name: 'agxaaa', token: 't', directory: '/p', url: 'u' })
    recordOpenCodeSession('ses_a', { containerName: C, conversationId: 'conv-a', connectionName: 'agxaaa' })

    await servers.releaseConversation(C, 'conv-a')
    expect(servers.isRunning(C)).toBe(true)
    expect(relays[0].calls.some(c => c.path === '/mcp/agxaaa/disconnect?directory=%2Fp')).toBe(true)
    expect(openCodeSessionEntry('ses_a')).toBeNull()

    await servers.releaseConversation(C, 'conv-b')
    expect(servers.isRunning(C)).toBe(false)
    expect(relays[0].stops).toBe(1)
    expect(relays[0].closed).toBe(true)
  })

  it('does not stop a server with a turn still running', async () => {
    const { deps } = fakeDeps(connected)
    const servers = new OpenCodeServers(deps)
    await servers.ensureServer(C, null)
    servers.turnStarted(C, 'conv-a')
    servers.turnStarted(C, 'conv-b')
    await servers.releaseConversation(C, 'conv-a')
    expect(servers.isRunning(C)).toBe(true)
  })

  it('restarts an idle server for a new OpenAI-compatible model name, never for its address, and refuses while another turn runs', async () => {
    const { deps, relays } = fakeDeps(connected)
    const servers = new OpenCodeServers(deps)
    await servers.ensureServer(C, { compatibleModel: 'llama3' })
    const config = () => JSON.parse(relays[0].starts.at(-1)!.env.OPENCODE_CONFIG_CONTENT)
    expect(config().provider.openai_compatible.options.baseURL).toMatch(/\/api\/v1\/model-relay\/openai_compatible$/)

    await servers.ensureServer(C, { compatibleModel: 'llama3' })
    expect(relays[0].starts).toHaveLength(1)

    await servers.ensureServer(C, { compatibleModel: 'qwen' })
    expect(relays[0].starts).toHaveLength(2)
    expect(Object.keys(config().provider.openai_compatible.models)).toEqual(['llama3', 'qwen'])

    servers.turnStarted(C, 'conv-a')
    await expect(servers.ensureServer(C, { compatibleModel: 'mistral' })).rejects.toThrow(/must restart to add this OpenAI-compatible model/)
    expect(relays[0].starts).toHaveLength(2)
  })

  it('drops the connections of a project folder whose instance was disposed', async () => {
    const { deps, relays } = fakeDeps(connected)
    const servers = new OpenCodeServers(deps)
    await servers.ensureServer(C, null)
    const conn = { name: 'agxaaa', token: 't', directory: '/projects/p1', url: 'u' }
    await servers.ensureConnection(C, 'conv-a', conn)
    relays[0].emit({ type: 'server.instance.disposed', properties: { directory: '/projects/p1' } }, '/projects/p1')
    await servers.ensureConnection(C, 'conv-a', conn)
    expect(relays[0].calls.filter(c => c.path.startsWith('/mcp?'))).toHaveLength(2)
  })

  it('does not use a server whose event stream never connects', async () => {
    const { deps, relays } = fakeDeps(connected, { neverConnects: true })
    const servers = new OpenCodeServers(deps)
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    try {
      const started = servers.ensureServer(C, null)
      const failed = expect(started).rejects.toThrow(/event stream did not connect/)
      await vi.advanceTimersByTimeAsync(16_000)
      await failed
    } finally {
      vi.useRealTimers()
    }
    expect(servers.isRunning(C)).toBe(false)
    expect(relays[0].stops).toBe(1)
  })

  it('gives up the running turns when the event stream is lost, and follows it again', async () => {
    const { deps, relays } = fakeDeps(connected)
    const servers = new OpenCodeServers(deps)
    await servers.ensureServer(C, null)
    const stopped: string[] = []
    servers.listen(C, 'ses_a', { onEvent: () => {}, onServerStopped: r => stopped.push(r) })
    relays[0].dropStream()
    await new Promise(r => setTimeout(r, 400))
    expect(stopped).toEqual(['the OpenCode event stream was interrupted'])
    expect(servers.isRunning(C)).toBe(true)
    expect(relays[0].subscriberCount).toBe(1)
  })
})
