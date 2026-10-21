import fs from 'node:fs'
import type net from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { JOIN_CODE_TTL_MS, normalizeJoinCode } from '@agenthix/core'
import { joinLookup } from '@agenthix/core/host-crypto'
import { requestLocalJoin } from '../control/client'
import { LOCAL_JOIN_TTL_MS, startControlSocket } from '../control/socket'
import { FakeHost, until } from './fakes'
import { startHarness, type Harness } from './harness'

let h: Harness
let control: net.Server
let socketPath: string
let host: FakeHost

beforeEach(async () => {
  h = await startHarness()
  let n = 0
  h.link.handle('join.open', () => ({ joinId: `j-${++n}` }))
  h.link.handle('join.accept', ({ joinId }) => ({ hostId: `h-${joinId}` }))
  socketPath = h.state.path('control.sock')
  control = await startControlSocket(socketPath, h.ctx)
  host = await FakeHost.create()
})
afterEach(async () => {
  await new Promise(r => control.close(r))
  await h.close()
})

describe("joining hq's own machine from the command line @SC-871", () => {
  it('opens a join of 10 minutes through a socket only its owner can use, and gives hq only the lookup', async () => {
    expect(fs.statSync(socketPath).mode & 0o777).toBe(0o600)
    const { code } = await requestLocalJoin(socketPath)
    const raw = normalizeJoinCode(code)!
    const [open] = h.link.callsOf('join.open')
    expect(open.lookup).toBe(await joinLookup(raw))
    const ttl = Date.parse(open.expiresAt) - Date.now()
    expect(ttl).toBeLessThanOrEqual(LOCAL_JOIN_TTL_MS)
    expect(ttl).toBeGreaterThan(LOCAL_JOIN_TTL_MS - 5_000)
    expect(LOCAL_JOIN_TTL_MS).toBeLessThan(JOIN_CODE_TTL_MS)
    expect(h.link.wire()).not.toContain(raw)
  })

  it('confirms by itself a machine whose binding proves the code, pins it as hq\'s machine, and installs nothing', async () => {
    const raw = normalizeJoinCode((await requestLocalJoin(socketPath)).code)!
    h.link.emit('joinRequest', await host.joinRequest('j-1', raw, 'hq-box'))
    await until(() => h.ctx.joins.get('j-1')?.state === 'done')
    expect(h.link.callsOf('join.accept').map(a => a.joinId)).toEqual(['j-1'])
    expect(h.ctx.hosts.byFingerprint(host.fingerprint)).toMatchObject({ hostId: 'h-j-1', machineName: 'hq-box', hqMachine: true, connectedBy: null })
    expect(h.link.envelopes).toHaveLength(0)
    expect(h.link.callsOf('activity.record').find(c => c.action === 'site.added')).toMatchObject({ byUserId: null })
  })

  it('still refuses a binding that does not prove the code', async () => {
    await requestLocalJoin(socketPath)
    h.link.emit('joinRequest', await host.joinRequest('j-1', 'ZZZZZZZZZZZZ', 'hq-box'))
    await new Promise(r => setTimeout(r, 30))
    expect(h.ctx.joins.get('j-1')?.state).toBe('waiting')
    expect(h.link.callsOf('join.accept')).toHaveLength(0)
    expect(h.ctx.hosts.list()).toHaveLength(0)
  })

  it('applies only to the join it opened', async () => {
    const auth = await h.signIn()
    const opened = await h.request('/api/joins', { method: 'POST', body: {}, ...auth })
    const personCode = normalizeJoinCode(opened.json.code as string)!
    await requestLocalJoin(socketPath)
    h.link.emit('joinRequest', await host.joinRequest('j-1', personCode, 'office-server'))
    await until(() => h.ctx.joins.get('j-1')?.state === 'confirming')
    await new Promise(r => setTimeout(r, 30))
    expect(h.ctx.joins.get('j-1')?.state).toBe('confirming')
    expect(h.link.callsOf('join.accept')).toHaveLength(0)
    expect(h.ctx.joins.get('j-2')?.state).toBe('waiting')
  })

  it('answers anything else on the socket with an error', async () => {
    await expect(requestLocalJoin(socketPath, 'shell')).rejects.toThrow(/unknown/)
  })
})
