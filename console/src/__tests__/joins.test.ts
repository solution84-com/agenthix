import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { formatFingerprint, normalizeJoinCode, type JoinAcceptance } from '@agenthix/core'
import { fingerprintOf, joinLookup, verifyConsoleJoinBinding } from '@agenthix/core/host-crypto'
import { FakeHost, until } from './fakes'
import { startHarness, type Harness } from './harness'

let h: Harness
let auth: { cookie: string; csrf: string }
let host: FakeHost
const CREDENTIAL_HASH = 'c'.repeat(64)

beforeEach(async () => {
  h = await startHarness()
  host = await FakeHost.create()
  h.link.handle('join.open', () => ({ joinId: 'j-1' }))
  h.link.handle('join.accept', () => ({ hostId: 'h-office' }))
  h.link.handle('join.refuse', () => ({ refused: true }))
  h.link.handle('site.register', () => ({ executionSiteId: 'es-office' }))
  auth = await h.signIn()
})
afterEach(async () => { await h.close() })

const api = (path: string, method = 'GET', body?: unknown) => h.request(path, { method, body, ...auth })

async function openCode(): Promise<string> {
  const res = await api('/api/joins', 'POST', {})
  expect(res.status).toBe(201)
  return normalizeJoinCode(res.json.code as string)!
}

describe('adding a site @SC-868', () => {
  it('gives hq the lookup and never the code', async () => {
    const code = await openCode()
    const [open] = h.link.callsOf('join.open')
    expect(open.lookup).toBe(await joinLookup(code))
    expect(open.purpose).toEqual({ kind: 'add' })
    const wire = h.link.wire()
    expect(wire).not.toContain(code)
    expect(wire).not.toContain(`${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`)
  })

  it('ignores a joining machine that cannot prove it holds the code', async () => {
    await openCode()
    h.link.emit('joinRequest', await host.joinRequest('j-1', 'ZZZZZZZZZZZZ'))
    await new Promise(r => setTimeout(r, 20))
    expect((await api('/api/joins/j-1')).json).toMatchObject({ state: 'waiting', machine: null })
  })

  it("shows the machine's name and fingerprint, and on confirmation installs and registers its site, named after the machine", async () => {
    const code = await openCode()
    h.link.emit('joinRequest', await host.joinRequest('j-1', code, 'office-server'))
    await until(() => h.ctx.joins.get('j-1')?.state === 'confirming')
    expect((await api('/api/joins/j-1')).json.machine).toEqual({
      name: 'office-server', fingerprint: host.fingerprint, fingerprintShort: formatFingerprint(host.fingerprint),
    })

    // A site is named after its machine: a name sent with the confirmation is not taken.
    const confirmed = await api('/api/joins/j-1/confirm', 'POST', { siteName: 'Front desk' })
    expect(confirmed.status).toBe(200)

    // The console's binding proves to the machine that it holds the code; hq could not have made it.
    const [accept] = h.link.callsOf('join.accept') as { acceptance: JoinAcceptance }[]
    const consoleFp = await fingerprintOf(accept.acceptance.identity)
    expect(await verifyConsoleJoinBinding(code, consoleFp, host.fingerprint, accept.acceptance.binding)).toBe(true)
    expect(h.ctx.hosts.byFingerprint(host.fingerprint)).toMatchObject({ hostId: 'h-office', siteName: 'office-server' })
    expect(h.link.callsOf('activity.record').find(c => c.action === 'site.added')).toMatchObject({ announce: true })
    expect(h.link.wire()).not.toContain(code)

    // The host service comes online with its machine credential; the install goes to it signed.
    host.consoleIdentity = accept.acceptance.identity
    h.link.emit('presence', { hostId: 'h-office', fingerprint: host.fingerprint, online: true, since: new Date().toISOString() })
    await until(() => h.link.envelopes.length > 0)
    const opened = await host.open(h.link.envelopes[0])
    if (!opened.ok) throw new Error(`install not opened: ${opened.reason}`)
    const message = opened.message as { requestId: string; request: unknown }
    expect(message.request).toEqual({ op: 'install', target: 'site', version: '0.2.0' })

    await h.ctx.commands.receive(await host.seal({
      kind: 'result', replyTo: message.requestId,
      result: { ok: true, op: 'install', result: { state: 'started', credentialHash: CREDENTIAL_HASH } as never },
    }))
    await until(() => h.ctx.joins.get('j-1')?.state === 'done')
    expect(h.link.callsOf('site.register')).toEqual([{ hostId: 'h-office', credentialHash: CREDENTIAL_HASH }])
    expect(h.ctx.hosts.byFingerprint(host.fingerprint)).toMatchObject({ siteName: 'office-server' })
    expect(h.link.wire()).not.toContain('Front desk')
    expect(h.ctx.hosts.byFingerprint(host.fingerprint)?.executionSiteId).toBe('es-office')
  })

  it('refuses a presence that names a pinned host under another fingerprint', async () => {
    const code = await openCode()
    h.link.emit('joinRequest', await host.joinRequest('j-1', code))
    await until(() => h.ctx.joins.get('j-1')?.state === 'confirming')
    await api('/api/joins/j-1/confirm', 'POST', {})
    h.link.emit('presence', { hostId: 'h-office', fingerprint: 'f'.repeat(64), online: true, since: new Date().toISOString() })
    expect(h.ctx.presence.of(host.fingerprint).online).toBe(false)
  })

  it('turns a machine away when the fleet admin does not recognise it', async () => {
    const code = await openCode()
    h.link.emit('joinRequest', await host.joinRequest('j-1', code))
    await until(() => h.ctx.joins.get('j-1')?.state === 'confirming')
    expect((await api('/api/joins/j-1/refuse', 'POST', {})).status).toBe(204)
    expect(h.link.callsOf('join.refuse')).toEqual([{ joinId: 'j-1' }])
    expect(h.ctx.hosts.list()).toHaveLength(0)
    expect((await api('/api/joins/j-1')).status).toBe(404)
  })

  async function confirmingOn(version: string) {
    await h.close()
    h = await startHarness({ version })
    h.link.handle('join.open', () => ({ joinId: 'j-1' }))
    h.link.handle('join.accept', () => ({ hostId: 'h-office' }))
    auth = await h.signIn()
    const code = await openCode()
    h.link.emit('joinRequest', await host.joinRequest('j-1', code))
    await until(() => h.ctx.joins.get('j-1')?.state === 'confirming')
  }

  it('installs the development build from a development build', async () => {
    await confirmingOn('dev')
    const res = await api('/api/joins/j-1/confirm', 'POST', {})
    expect(res.status).toBe(200)
    expect(h.link.callsOf('join.accept')).toHaveLength(1)
  })

  it('installs a pre-release at its own version', async () => {
    await confirmingOn('1.0.0-alpha.2')
    const res = await api('/api/joins/j-1/confirm', 'POST', {})
    expect(res.status).toBe(200)
    expect(h.link.callsOf('join.accept')).toHaveLength(1)
  })

  it('never installs a development build from a published one', async () => {
    await confirmingOn('0.2.0')
    const res = await api('/api/joins/j-1/confirm', 'POST', { version: 'dev' })
    expect(res.status).toBe(409)
    expect(h.link.callsOf('join.accept')).toHaveLength(0)
  })

  it('needs a published version when a development build is asked for another', async () => {
    await confirmingOn('dev')
    const res = await api('/api/joins/j-1/confirm', 'POST', { version: 'latest' })
    expect(res.status).toBe(409)
    expect(h.link.callsOf('join.accept')).toHaveLength(0)
  })
})

describe('a join presenting a machine already in the fleet @SC-869', () => {
  async function pinOffice() {
    await h.ctx.hosts.pin({
      fingerprint: host.fingerprint, hostId: 'h-office', identity: host.keys.identity, machineName: 'office-server',
      siteName: 'office-server', executionSiteId: 'es-office', connectedAt: new Date().toISOString(), connectedBy: 'u-sam',
    })
  }
  const online = (on: boolean) =>
    h.link.emit('presence', { hostId: 'h-office', fingerprint: host.fingerprint, online: on, since: new Date().toISOString() })

  it('is refused while that machine is online, and nothing is replaced', async () => {
    await pinOffice()
    online(true)
    const code = await openCode()
    h.link.emit('joinRequest', await host.joinRequest('j-1', code))
    await until(() => h.ctx.joins.get('j-1')?.state === 'failed')
    expect(h.ctx.joins.get('j-1')?.problem).toMatch(/already in the fleet as office-server, and it is online/)
    expect(h.link.callsOf('join.refuse')).toEqual([{ joinId: 'j-1' }])
    expect((await api('/api/joins/j-1/confirm', 'POST', {})).status).toBe(409)
    expect(h.link.callsOf('join.accept')).toEqual([])
    expect(h.ctx.hosts.byFingerprint(host.fingerprint)).toMatchObject({ executionSiteId: 'es-office' })
  })

  it('warns while that machine is offline, and confirming replaces it and its site', async () => {
    h.link.handle('site.remove', () => ({ removed: true }))
    await pinOffice()
    const code = await openCode()
    h.link.emit('joinRequest', await host.joinRequest('j-1', code))
    await until(() => h.ctx.joins.get('j-1')?.state === 'confirming')
    expect((await api('/api/joins/j-1')).json.replaces).toEqual({
      siteName: 'office-server', machineName: 'office-server',
      warning: 'This machine is already in the fleet as office-server; confirming replaces it.',
    })
    expect((await api('/api/joins/j-1/confirm', 'POST', {})).status).toBe(200)
    expect(h.link.callsOf('site.remove')).toEqual([{ executionSiteId: 'es-office' }])
    expect(h.link.callsOf('join.accept')).toHaveLength(1)
    expect(h.ctx.hosts.list()).toHaveLength(1)
  })

  it('is refused at confirmation when that machine came online meanwhile', async () => {
    await pinOffice()
    const code = await openCode()
    h.link.emit('joinRequest', await host.joinRequest('j-1', code))
    await until(() => h.ctx.joins.get('j-1')?.state === 'confirming')
    online(true)
    expect((await api('/api/joins/j-1/confirm', 'POST', {})).status).toBe(409)
    expect(h.link.callsOf('join.accept')).toEqual([])
    expect(h.link.callsOf('join.refuse')).toEqual([{ joinId: 'j-1' }])
  })
})

describe('two machines of the same name @SC-870', () => {
  it('cannot both be sites: a machine named as one in the fleet is turned away, in words that name it', async () => {
    const other = await FakeHost.create()
    await h.ctx.hosts.pin({
      fingerprint: other.fingerprint, hostId: 'h-other', identity: other.keys.identity, machineName: 'Office-Server',
      siteName: 'Office-Server', executionSiteId: 'es-other', connectedAt: new Date().toISOString(), connectedBy: 'u-sam',
    })
    const code = await openCode()
    h.link.emit('joinRequest', await host.joinRequest('j-1', code, 'office-server'))
    await until(() => h.ctx.joins.get('j-1')?.state === 'failed')
    expect(h.ctx.joins.get('j-1')?.problem).toBe(
      `A machine named Office-Server is already in the fleet (${formatFingerprint(other.fingerprint)}), and two machines of the same name cannot both be sites. Give this machine another name, then add it with a new code.`,
    )
    expect(h.link.callsOf('join.refuse')).toEqual([{ joinId: 'j-1' }])
    expect((await api('/api/joins/j-1/confirm', 'POST', {})).status).toBe(409)
    expect(h.link.callsOf('join.accept')).toEqual([])
  })
})

describe('disconnecting a machine @SC-878', () => {
  it("removes the site's and the machine's credentials in hq, unpins it, and is announced", async () => {
    h.link.handle('site.remove', () => ({ removed: true }))
    h.link.handle('host.disconnect', () => ({ disconnected: true }))
    await h.ctx.hosts.pin({
      fingerprint: host.fingerprint, hostId: 'h-office', identity: host.keys.identity, machineName: 'office-server',
      siteName: 'office-server', executionSiteId: 'es-office', connectedAt: new Date().toISOString(), connectedBy: 'u-sam',
    })
    const res = await api(`/api/hosts/${host.fingerprint}/disconnect`, 'POST', {})
    expect(res.status).toBe(200)
    expect(h.link.callsOf('site.remove')).toEqual([{ executionSiteId: 'es-office' }])
    expect(h.link.callsOf('host.disconnect')).toEqual([{ hostId: 'h-office' }])
    expect(h.ctx.hosts.byFingerprint(host.fingerprint)).toBeNull()
    expect(h.link.callsOf('activity.record').find(c => c.action === 'site.disconnected')).toMatchObject({ announce: true })
  })
})
