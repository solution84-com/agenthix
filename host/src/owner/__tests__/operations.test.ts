import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { ownerHandler, logLines } from '../dispatch'

let m: FakeMachine
beforeEach(async () => {
  m = fakeMachine()
  await install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
  m.calls.length = 0
})
afterEach(() => m.cleanup())

const ask = (data: unknown) => ownerHandler(m.ctx)(data, () => {}) as Promise<Record<string, unknown>>

describe('the operations this version does @SC-847', () => {
  it('reads the machine’s figures, figures only', async () => {
    const answer = await ask({ op: 'figures.read' })
    expect(answer.ok).toBe(true)
    const figures = answer.result as Record<string, unknown> & { installs: { target: string; state: string }[] }
    expect(figures.installs).toEqual([
      expect.objectContaining({ target: 'hq', state: 'running', healthy: true }),
      expect.objectContaining({ target: 'site', state: 'running', healthy: true }),
    ])
    expect(figures.ceilings).toEqual({ memoryBytesPerContainer: 8 * 1024 ** 3, cpusPerContainer: 2, processesPerContainer: 4096, containersAtOnce: 5 })
    expect(JSON.stringify(figures)).not.toMatch(/acme|setup\?token|secret/i)
  })

  it('stops and starts hq through its compose project', async () => {
    expect(await ask({ op: 'stop', target: 'hq' })).toMatchObject({ ok: true, result: { state: 'stopped' } })
    expect(m.up.has('agenthix-hq')).toBe(false)
    expect(await ask({ op: 'start', target: 'hq' })).toMatchObject({ ok: true, result: { state: 'started' } })
    expect(m.calls.map(c => c.slice(0, 5).join(' '))).toEqual([
      'compose -p agenthix-hq -f ' + m.ctx.state.path('hq', 'compose.json'),
      'compose -p agenthix-hq -f ' + m.ctx.state.path('hq', 'compose.json'),
    ])
  })

  it("stops the site with the agents it started, and stopping hq leaves the site's agents be @SC-2196", async () => {
    m.agentContainers.push('agenthix-agent-user-u1-rw')
    expect(await ask({ op: 'stop', target: 'hq' })).toMatchObject({ ok: true })
    expect(m.agentContainers).toEqual(['agenthix-agent-user-u1-rw'])
    expect(await ask({ op: 'stop', target: 'site' })).toMatchObject({ ok: true, result: { state: 'stopped' } })
    expect(m.up.has('agenthix-site')).toBe(false)
    expect(m.agentContainers).toEqual([])
  })

  it('reads logs of one named part, and refuses a part that does not exist', async () => {
    expect(await ask({ op: 'logs.read', target: 'hq', service: 'hq-server' })).toMatchObject({
      ok: true, result: { lines: [{ service: 'hq-server', at: '2026-10-14T09:00:00Z', message: 'started' }] },
    })
    expect(await ask({ op: 'logs.read', target: 'hq', service: '../../etc' })).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
  })

  it('reads only the logs at or after since, and asks compose for them', async () => {
    const lines = async (since: string) => ((await ask({ op: 'logs.read', target: 'hq', service: 'hq-server', since })).result as { lines: unknown[] }).lines
    expect(await lines('2026-10-14T09:00:00Z')).toHaveLength(1)
    expect(await lines('2026-10-14T09:00:01Z')).toHaveLength(0)
    expect(m.calls.some(c => c.join(' ').includes('--since 2026-10-14T09:00:01Z'))).toBe(true)
  })

  it('installs hq for a controller only at the version it ships with, and never a site on its own', async () => {
    expect(await ask({ op: 'install', target: 'hq', version: '9.9.9', address: 'https://hq.acme.example' }))
      .toMatchObject({ ok: false, refusal: { code: 'conflict' } })
    expect(await ask({ op: 'install', target: 'site', version: '0.2.0' }))
      .toMatchObject({ ok: false, refusal: { code: 'conflict' } })
  })

  it('reports the status of hq and its site together', async () => {
    const answer = await ask({ op: 'machine.status' })
    expect(answer.result).toMatchObject({
      hq: { address: 'https://hq.acme.example', containers: 'running', answer: { users: 0 } },
      site: { name: 'hq-box', carriesHq: true, containers: 'running', connection: 'connected' },
    })
  })
})

describe('an install of hq a controller asks for', () => {
  it('publishes HQ and its Fleet Console on the ports the request chose', async () => {
    const empty = fakeMachine()
    try {
      const answer = await ownerHandler(empty.ctx)({
        op: 'install', target: 'hq', version: empty.ctx.machine.hostServiceVersion, address: 'https://hq.acme.example', hqPort: 7500, consolePort: 7501,
      }, () => {}) as Record<string, unknown>
      expect(answer).toMatchObject({ ok: true, result: { state: 'started' } })
      expect(empty.ctx.state.readJson('installation.json')).toMatchObject({ ports: { hq: 7500, console: 7501 } })
    } finally {
      empty.cleanup()
    }
  })
})

describe('log lines', () => {
  it('names each line by its part, not its container', () => {
    expect(logLines('agenthix-site  | 2026-10-14T09:00:00Z Paired with hq\nnoise\n', { 'agenthix-site': 'site' }))
      .toEqual([{ at: '2026-10-14T09:00:00Z', service: 'site', level: 'info', message: 'Paired with hq' }])
  })
})
