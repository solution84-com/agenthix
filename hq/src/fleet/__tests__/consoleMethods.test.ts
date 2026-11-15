/**
 * What the console link accepts (core's ConsoleLinkMethods): a closed set, each method's parameters checked and only
 * the named ones passed on, and a service's refusal answered in its own code.
 */
import { describe, expect, it } from 'vitest'
import { CONSOLE_LINK_METHODS } from '@agenthix/core'
import { generateHostKeys } from '@agenthix/core/host-crypto'
import { ConsoleRefusal, consoleRequestHandler, type ConsoleServices } from '../consoleMethods'

function recording() {
  const calls: { method: string; params: unknown }[] = []
  const services = Object.fromEntries(CONSOLE_LINK_METHODS.map(m => [m, async (params: unknown) => {
    calls.push({ method: m, params })
    return { done: m }
  }])) as unknown as ConsoleServices
  return { calls, handle: consoleRequestHandler(services) }
}

describe('the console link’s methods @SC-924', () => {
  it('refuses any method outside the closed set, and calls nothing', async () => {
    const { calls, handle } = recording()
    for (const method of ['machine.shell', 'docker.run', '__proto__', 'constructor', 'toString']) {
      expect(await handle(method, {})).toMatchObject({ ok: false, code: 'unknown_method' })
    }
    expect(calls).toEqual([])
  })

  it('passes only the parameters a method names', async () => {
    const { calls, handle } = recording()
    await handle('fleetAdmin.grant', { userId: 'u-1', byUserId: 'u-2', role: 'ADMIN', fleetAdmin: true })
    expect(calls).toEqual([{ method: 'fleetAdmin.grant', params: { userId: 'u-1', byUserId: 'u-2' } }])
  })

  it('refuses parameters that are missing or not valid as malformed', async () => {
    const { calls, handle } = recording()
    const bad: [string, unknown][] = [
      ['fleetAdmin.grant', { userId: 'u-1' }],
      ['signIn.check', { username: 'sam', password: 7 }],
      ['join.open', { lookup: 'not-hex', expiresAt: new Date().toISOString(), purpose: { kind: 'add' } }],
      ['join.open', { lookup: 'a'.repeat(64), expiresAt: 'soon', purpose: { kind: 'add' } }],
      ['join.open', { lookup: 'a'.repeat(64), expiresAt: new Date().toISOString(), purpose: { kind: 'take-over' } }],
      ['site.register', { hostId: 'h', credentialHash: 'abc' }],
      ['activity.record', { byUserId: 'u', action: 'a', subject: 's', at: new Date().toISOString(), announce: 'yes' }],
      ['host.disconnect', 'h1'],
    ]
    for (const [method, params] of bad) expect(await handle(method, params), method).toMatchObject({ ok: false, code: 'malformed' })
    expect(calls).toEqual([])
  })

  it('opens a code for restoring a lost site, naming the site and nothing else (adr-0119)', async () => {
    const { calls, handle } = recording()
    const expiresAt = new Date(Date.now() + 60_000).toISOString()
    await handle('join.open', { lookup: 'a'.repeat(64), expiresAt, purpose: { kind: 'restoreSite', siteId: 'es-1', key: 'never' } })
    expect(calls).toEqual([{ method: 'join.open', params: { lookup: 'a'.repeat(64), expiresAt, purpose: { kind: 'restoreSite', siteId: 'es-1' } } }])
    expect(await handle('join.open', { lookup: 'a'.repeat(64), expiresAt, purpose: { kind: 'restoreSite' } })).toMatchObject({ ok: false, code: 'malformed' })
  })

  it('accepts a join only with the Fleet Console’s identity, never a host’s', async () => {
    const { handle } = recording()
    const host = await generateHostKeys('host')
    const fleetConsole = await generateHostKeys('console')
    const binding = 'b'.repeat(43)
    expect(await handle('join.accept', { joinId: 'j1', acceptance: { identity: host.identity, binding } }))
      .toMatchObject({ ok: false, code: 'malformed' })
    expect(await handle('join.accept', { joinId: 'j1', acceptance: { identity: fleetConsole.identity, binding } }))
      .toMatchObject({ ok: true })
  })

  it('accepts a null actor for activity.record only: the machine did it', async () => {
    const { calls, handle } = recording()
    const at = new Date().toISOString()
    expect(await handle('activity.record', { byUserId: null, action: 'a', subject: 's', at, announce: false })).toMatchObject({ ok: true })
    expect(calls[0].params).toMatchObject({ byUserId: null })
    expect(await handle('fleetAdmin.grant', { userId: 'u-1', byUserId: null })).toMatchObject({ ok: false, code: 'malformed' })
  })

  it('asks nothing of the screens’ facts, and passes nothing on', async () => {
    const { calls, handle } = recording()
    expect(await handle('hq.about', { userId: 'u-1' })).toMatchObject({ ok: true })
    expect(await handle('site.loads', undefined)).toMatchObject({ ok: true })
    expect(await handle('relay.facts', { relayId: 'r-1' })).toMatchObject({ ok: true })
    expect(calls).toEqual([{ method: 'hq.about', params: {} }, { method: 'site.loads', params: {} }, { method: 'relay.facts', params: {} }])
  })

  it('reads the record, the notices and an account only for a named fleet admin, and passes on only what each names', async () => {
    const { calls, handle } = recording()
    expect(await handle('activity.list', { byUserId: 'u-1', after: 'a-9', limit: 10000 })).toMatchObject({ ok: true })
    expect(await handle('activity.list', { byUserId: 'u-1' })).toMatchObject({ ok: true })
    expect(await handle('notices.list', { byUserId: 'u-1', all: true })).toMatchObject({ ok: true })
    expect(await handle('notices.dismiss', { byUserId: 'u-1', noticeId: 'n-1' })).toMatchObject({ ok: true })
    expect(await handle('account.find', { byUserId: 'u-1', username: '  Jordan ' })).toMatchObject({ ok: true })
    expect(calls).toEqual([
      { method: 'activity.list', params: { byUserId: 'u-1', after: 'a-9' } },
      { method: 'activity.list', params: { byUserId: 'u-1' } },
      { method: 'notices.list', params: { byUserId: 'u-1' } },
      { method: 'notices.dismiss', params: { byUserId: 'u-1', noticeId: 'n-1' } },
      { method: 'account.find', params: { byUserId: 'u-1', username: 'jordan' } },
    ])
  })

  it('takes a machine’s silence facts — a notification preference only — and passes on only what they name', async () => {
    const { calls, handle } = recording()
    expect(await handle('host.silenceFacts', { hostId: 'h-1', notifyIfSilent: false, stoppedAt: null, op: 'erase' })).toMatchObject({ ok: true })
    expect(await handle('host.silenceFacts', { hostId: 'h-1', notifyIfSilent: true, stoppedAt: '2026-10-15T09:30:00+01:00' })).toMatchObject({ ok: true })
    for (const bad of [{ hostId: 'h-1', notifyIfSilent: 'no', stoppedAt: null }, { hostId: 'h-1', notifyIfSilent: true }, { hostId: '../x', notifyIfSilent: true, stoppedAt: null }, { hostId: 'h-1', notifyIfSilent: true, stoppedAt: 'soon' }]) {
      expect(await handle('host.silenceFacts', bad)).toMatchObject({ ok: false, code: 'malformed' })
    }
    expect(calls).toEqual([
      { method: 'host.silenceFacts', params: { hostId: 'h-1', notifyIfSilent: false, stoppedAt: null } },
      { method: 'host.silenceFacts', params: { hostId: 'h-1', notifyIfSilent: true, stoppedAt: '2026-10-15T08:30:00.000Z' } },
    ])
  })

  it('refuses a read with no fleet admin named, or one not valid, as malformed', async () => {
    const { calls, handle } = recording()
    const bad: [string, unknown][] = [
      ['activity.list', {}],
      ['activity.list', { byUserId: null }],
      ['activity.list', { byUserId: 'u-1', after: '../x' }],
      ['notices.list', { byUserId: 7 }],
      ['notices.dismiss', { byUserId: 'u-1' }],
      ['account.find', { byUserId: 'u-1', username: '' }],
      ['account.find', { byUserId: 'u-1', username: 'x'.repeat(201) }],
      ['account.find', { username: 'jordan' }],
    ]
    for (const [method, params] of bad) expect(await handle(method, params), method).toMatchObject({ ok: false, code: 'malformed' })
    expect(calls).toEqual([])
  })

  it('the connection to Cloud names the fleet admin asking, and passes on nothing else @SC-1099', async () => {
    const { calls, handle } = recording()
    for (const method of ['cloud.state']) {
      expect(await handle(method, { byUserId: 'u-1', cloudUrl: 'https://elsewhere.example', publicKey: 'x' })).toMatchObject({ ok: true })
      expect(await handle(method, {}), method).toMatchObject({ ok: false, code: 'malformed' })
      expect(await handle(method, { byUserId: null }), method).toMatchObject({ ok: false, code: 'malformed' })
    }
    expect(calls).toEqual([{ method: 'cloud.state', params: { byUserId: 'u-1' } }])
  })

  it('the ask count and the offers name the fleet admin, and an offer is one of the three @SC-1112', async () => {
    const { calls, handle } = recording()
    for (const method of ['cloud.askCount', 'cloud.offers']) {
      expect(await handle(method, { byUserId: 'u-1', extra: 1 })).toMatchObject({ ok: true })
      expect(await handle(method, {}), method).toMatchObject({ ok: false, code: 'malformed' })
    }
    expect(await handle('cloud.dismissOffer', { byUserId: 'u-1', offer: 'backups' })).toMatchObject({ ok: true })
    for (const bad of [{ byUserId: 'u-1' }, { byUserId: 'u-1', offer: 'upgrade' }, { offer: 'site' }]) {
      expect(await handle('cloud.dismissOffer', bad)).toMatchObject({ ok: false, code: 'malformed' })
    }
    expect(calls).toEqual([
      { method: 'cloud.askCount', params: { byUserId: 'u-1' } },
      { method: 'cloud.offers', params: { byUserId: 'u-1' } },
      { method: 'cloud.dismissOffer', params: { byUserId: 'u-1', offer: 'backups' } },
    ])
  })

  it('answers a service’s refusal in its own code and words', async () => {
    const services = { 'fleetAdmin.grant': async () => { throw new ConsoleRefusal('not_allowed', 'Only a fleet admin can.') } }
    const handle = consoleRequestHandler(services as unknown as ConsoleServices)
    expect(await handle('fleetAdmin.grant', { userId: 'u-1', byUserId: 'u-2' }))
      .toEqual({ ok: false, code: 'not_allowed', message: 'Only a fleet admin can.' })
  })
})
