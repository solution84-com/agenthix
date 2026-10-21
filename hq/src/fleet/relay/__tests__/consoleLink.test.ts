/**
 * The console link (host-management spec §4 C8) and a machine joining through it (§6): who may hold the link, what it
 * answers, and a join lookup that works once and runs out.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fingerprintOf, generateHostKeys, type HostKeys } from '@agenthix/core/host-crypto'
import { consoleRequestHandler, type ConsoleServices } from '../../consoleMethods'
import { hostLink, consoleLink, opened, refusedWith, sendFrame, startHarness, type Harness } from './relayHarness'

let h: Harness
beforeEach(async () => {
  h = await startHarness()
})
afterEach(() => h.close())

const asConsole = () => consoleLink(h, { Authorization: `Bearer ${h.consoleSecret}` })

describe('who may hold the console link @SC-924', () => {
  it('refuses a wrong secret, no secret, and a code that is not one', async () => {
    expect(await refusedWith(consoleLink(h, { Authorization: 'Bearer wrong-secret' }))).toBe(401)
    expect(await refusedWith(consoleLink(h, {}))).toBe(401)
    expect(await refusedWith(consoleLink(h, { 'X-Console-Code': 'K7QM-4XPD-93TB' }))).toBe(401)
  })

  it('gives a Fleet Console that redeems its code its credential first, and retires the one before', async () => {
    const before = asConsole()
    await opened(before)
    const lookup = 'a'.repeat(64)
    h.codes.set(lookup, 'fcc_lasting')
    const after = consoleLink(h, { 'X-Console-Code': lookup })
    await opened(after)
    expect((await after.next('console.credential')).payload).toEqual({ credential: 'fcc_lasting' })
    expect(await before.closed).toBe(4001)
    // Once only.
    expect(await refusedWith(consoleLink(h, { 'X-Console-Code': lookup }))).toBe(401)
  })
})

describe('one Fleet Console at a time @SC-924', () => {
  it('closes the older link when another connects, and passes envelopes only to the newest', async () => {
    const first = asConsole()
    await opened(first)
    const second = asConsole()
    await opened(second)
    expect(await first.closed).toBe(4000)
    expect(h.hub.isConsoleConnected()).toBe(true)
    second.ws.close()
    await second.closed
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(h.hub.isConsoleConnected()).toBe(false)
  })
})

describe('requests over the console link @SC-924', () => {
  beforeEach(() => {
    const services = { 'host.list': async () => ({ hosts: [] }) } as unknown as ConsoleServices
    h.answer = consoleRequestHandler(services)
  })

  it('answers a known method', async () => {
    const m = asConsole()
    await opened(m)
    sendFrame(m, 'console.request', { method: 'host.list', params: {} }, { requestId: 'q1' })
    expect(await m.next('console.response')).toMatchObject({ replyTo: 'q1', payload: { hosts: [] } })
  })

  it('answers any other method unknown_method', async () => {
    const m = asConsole()
    await opened(m)
    sendFrame(m, 'console.request', { method: 'machine.shell', params: { command: 'id' } }, { requestId: 'q2' })
    expect(await m.next('console.error')).toMatchObject({ replyTo: 'q2', payload: { code: 'unknown_method' } })
  })

  it('answers parameters that are not valid malformed', async () => {
    const m = asConsole()
    await opened(m)
    sendFrame(m, 'console.request', { method: 'host.disconnect', params: { hostId: '../../etc' } }, { requestId: 'q3' })
    expect(await m.next('console.error')).toMatchObject({ replyTo: 'q3', payload: { code: 'malformed' } })
  })
})

describe('a machine joining @SC-925', () => {
  let machine: HostKeys
  let fleetConsole: HostKeys
  const lookup = 'a'.repeat(64)
  beforeAll(async () => {
    machine = await generateHostKeys('host')
    fleetConsole = await generateHostKeys('console')
  })
  const join = () => ({ lookup, identity: machine.identity, machineName: 'office-server', binding: 'b'.repeat(43) })

  it('is passed to the Fleet Console, and once accepted carries on as the machine’s link', async () => {
    h.joins.set(lookup, { ok: true, joinId: 'j1', expiresAt: new Date(Date.now() + 60_000) })
    const m = asConsole()
    await opened(m)
    const joining = hostLink(h, { 'X-Host-Join': lookup })
    await opened(joining)
    sendFrame(joining, 'host.join', join())
    const asked = await m.next('join.request')
    expect(asked.payload).toEqual({ joinId: 'j1', identity: machine.identity, machineName: 'office-server', binding: 'b'.repeat(43) })
    expect(h.recorded).toEqual([{ joinId: 'j1', fingerprint: await fingerprintOf(machine.identity), machineName: 'office-server' }])

    const peer = { hostId: 'h9', fingerprint: await fingerprintOf(machine.identity), consoleFingerprint: await fingerprintOf(fleetConsole.identity) }
    const acceptance = { identity: fleetConsole.identity, binding: 'c'.repeat(43) }
    expect(h.hub.completeJoin('j1', { hostId: 'h9', machineCredential: 'hmc_x', acceptance }, peer)).toBe(true)
    expect((await joining.next('host.joined')).payload).toEqual({ hostId: 'h9', machineCredential: 'hmc_x', acceptance })
    expect((await m.next('host.presence')).payload).toMatchObject({ hostId: 'h9', online: true })
    expect(h.hub.isHostOnline('h9')).toBe(true)
  })

  it('passes a claim that the machine runs HQ as it came, since the binding covers it, and refuses one that is not a yes', async () => {
    h.joins.set(lookup, { ok: true, joinId: 'j1', expiresAt: new Date(Date.now() + 60_000) })
    const m = asConsole()
    await opened(m)
    const joining = hostLink(h, { 'X-Host-Join': lookup })
    await opened(joining)
    sendFrame(joining, 'host.join', { ...join(), runsHq: true })
    expect((await m.next('join.request')).payload).toEqual({ joinId: 'j1', identity: machine.identity, machineName: 'office-server', runsHq: true, binding: 'b'.repeat(43) })

    h.joins.set(lookup, { ok: true, joinId: 'j2', expiresAt: new Date(Date.now() + 60_000) })
    const odd = hostLink(h, { 'X-Host-Join': lookup })
    await opened(odd)
    sendFrame(odd, 'host.join', { ...join(), runsHq: 'yes' })
    expect((await odd.next('host.joinRefused')).payload).toEqual({ reason: 'refused' })
  })

  it('passes the backup a machine says it restores as it came, and refuses one that is not a claim (adr-0119)', async () => {
    h.joins.set(lookup, { ok: true, joinId: 'j1', expiresAt: new Date(Date.now() + 60_000) })
    const m = asConsole()
    await opened(m)
    const joining = hostLink(h, { 'X-Host-Join': lookup })
    await opened(joining)
    const restores = { siteName: 'office', takenAt: '2026-10-14T02:00:00.000Z' }
    sendFrame(joining, 'host.join', { ...join(), restores: { ...restores, key: 'never passed' } })
    expect((await m.next('join.request')).payload).toEqual({ joinId: 'j1', identity: machine.identity, machineName: 'office-server', restores, binding: 'b'.repeat(43) })

    h.joins.set(lookup, { ok: true, joinId: 'j2', expiresAt: new Date(Date.now() + 60_000) })
    const odd = hostLink(h, { 'X-Host-Join': lookup })
    await opened(odd)
    sendFrame(odd, 'host.join', { ...join(), restores: { siteName: 'office', takenAt: 'last night' } })
    expect((await odd.next('host.joinRefused')).payload).toEqual({ reason: 'refused' })
  })

  it('works once: a second machine presenting the same lookup is told it was used', async () => {
    h.joins.set(lookup, { ok: true, joinId: 'j1', expiresAt: new Date(Date.now() + 60_000) })
    await opened(hostLink(h, { 'X-Host-Join': lookup }))
    const second = hostLink(h, { 'X-Host-Join': lookup })
    expect((await second.next('host.joinRefused')).payload).toEqual({ reason: 'used' })
    expect(await second.closed).toBe(4002)
  })

  it('runs out: a machine still waiting when its code expires is told so and let go', async () => {
    h.joins.set(lookup, { ok: true, joinId: 'j1', expiresAt: new Date(Date.now() + 150) })
    const joining = hostLink(h, { 'X-Host-Join': lookup })
    expect((await joining.next('host.joinRefused')).payload).toEqual({ reason: 'expired' })
    expect(h.hub.isJoining('j1')).toBe(false)
  })

  it('refuses a lookup no join has, and a join whose identity is not a host’s', async () => {
    expect(await refusedWith(hostLink(h, { 'X-Host-Join': 'f'.repeat(64) }))).toBe(401)
    h.joins.set(lookup, { ok: true, joinId: 'j2', expiresAt: new Date(Date.now() + 60_000) })
    const m = asConsole()
    await opened(m)
    const joining = hostLink(h, { 'X-Host-Join': lookup })
    await opened(joining)
    sendFrame(joining, 'host.join', { ...join(), identity: fleetConsole.identity })
    expect((await joining.next('host.joinRefused')).payload).toEqual({ reason: 'refused' })
    expect(m.frames.filter(f => f.type === 'join.request')).toEqual([])
  })

  it('lets a waiting machine go when the Fleet Console started anew, which no longer holds its code', async () => {
    h.joins.set(lookup, { ok: true, joinId: 'j1', expiresAt: new Date(Date.now() + 60_000) })
    h.consoleStarted = async at => {
      h.starts.push(at)
      h.hub.dropJoin('j1')
    }
    const before = asConsole()
    await opened(before)
    const joining = hostLink(h, { 'X-Host-Join': lookup })
    await opened(joining)
    sendFrame(joining, 'host.join', join())
    await before.next('join.request')
    before.ws.close()
    await before.closed

    const restarted = asConsole()
    await opened(restarted)
    sendFrame(restarted, 'console.hello', { started: true })
    expect(await joining.closed).toBe(4002)
    expect(h.starts).toHaveLength(1)
    expect(h.hub.isJoining('j1')).toBe(false)
    // Not refused by anyone: the machine says HQ no longer holds its code, and asks for a new one.
    expect(joining.frames.filter(f => f.type === 'host.joinRefused')).toEqual([])
  })

  it('keeps every join for a Fleet Console that only lost its connection for a moment', async () => {
    h.joins.set(lookup, { ok: true, joinId: 'j1', expiresAt: new Date(Date.now() + 60_000) })
    const before = asConsole()
    await opened(before)
    const joining = hostLink(h, { 'X-Host-Join': lookup })
    await opened(joining)
    sendFrame(joining, 'host.join', join())
    await before.next('join.request')
    before.ws.close()
    await before.closed

    const again = asConsole()
    await opened(again)
    sendFrame(again, 'console.hello', { started: false })
    expect((await again.next('join.request')).payload).toMatchObject({ joinId: 'j1' })
    sendFrame(again, 'ping', {})
    await again.next('pong')
    expect(h.starts).toEqual([])
    expect(h.hub.isJoining('j1')).toBe(true)
  })

  it('passes nothing a joining machine sends before it is accepted', async () => {
    h.joins.set(lookup, { ok: true, joinId: 'j3', expiresAt: new Date(Date.now() + 60_000) })
    const m = asConsole()
    await opened(m)
    const joining = hostLink(h, { 'X-Host-Join': lookup })
    await opened(joining)
    sendFrame(joining, 'relay.envelope', { envelope: { v: 1 } })
    sendFrame(joining, 'ping', {})
    await joining.next('pong')
    expect(m.frames.filter(f => f.type === 'relay.envelope')).toEqual([])
    expect(joining.frames.filter(f => f.type === 'relay.undeliverable')).toEqual([])
  })
})
