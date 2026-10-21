// hq's relay between the Fleet Console and a host service, end to end over its
// two real links (host-management spec §4 C3, C8, §7): hq passes a signed,
// sealed envelope unchanged between the two parties that pinned each other,
// refuses any other, closes a disconnected machine's link,
// and answers `signIn.check` by the fleet admin role. Runs after 04-pairing,
// on the pair it leaves running; it joins a machine of its own and adds no site.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { generateHostKeys, sealEnvelope } from '../../core/dist/host/crypto/index.js'
import type { HostIdentity, HostMessage } from '../../core/dist/index.js'
import { hqDb } from './harness/db'
import { runHqMachineCommand } from './harness/hqMachine'
import { StandInHost, StandInConsole, joinMachine } from './harness/fleetConsole'

const BY = { kind: 'fleetAdmin' as const, userId: 'cross-app-fleet-admin', name: 'Cross-App Fleet Admin' }
const figuresRead = (): HostMessage => ({ kind: 'request', requestId: randomUUID(), by: BY, request: { op: 'figures.read' } })

let fleetConsole: StandInConsole
let host: StandInHost
let hostId: string
let hostIdentity: HostIdentity

beforeAll(async () => {
  fleetConsole = await StandInConsole.connect()
  host = await StandInHost.create('cross-app-relay-machine')
  ;({ hostId, identity: hostIdentity } = await joinMachine(fleetConsole, host))
}, 120_000)

afterAll(() => {
  fleetConsole?.close()
  host?.link?.close()
})

describe('the relay passes envelopes only between the parties that pinned each other @SC-923', () => {
  it('an envelope signed and sealed by the Fleet Console reaches the host through hq byte for byte, and opens; so does the answer', async () => {
    const envelope = await fleetConsole.seal(hostIdentity, figuresRead())
    fleetConsole.link.send('relay.envelope', { envelope })

    const { envelope: arrived, message } = await host.nextRequest()
    expect(JSON.stringify(arrived)).toBe(JSON.stringify(envelope))
    expect(message.request).toEqual({ op: 'figures.read' })

    await host.answer(message.requestId, { ok: false, op: 'figures.read', refusal: { code: 'failed', message: 'A stand-in has no figures.' } })
    const back = await fleetConsole.link.next('relay.envelope', f => f.payload.envelope.from === envelope.to)
    expect(await fleetConsole.open(back.payload.envelope, hostIdentity)).toMatchObject({
      kind: 'result', replyTo: message.requestId, result: { ok: false, refusal: { code: 'failed' } },
    })
  })

  it('an envelope from an identity the host did not pin is refused by hq, and never reaches the host', async () => {
    const stranger = await generateHostKeys('console')
    const envelope = await sealEnvelope({ sender: stranger, recipient: hostIdentity, message: figuresRead() })
    fleetConsole.link.send('relay.envelope', { envelope })

    const refused = await fleetConsole.link.next('relay.undeliverable', f => f.payload.envelopeId === envelope.id)
    expect(refused.payload.reason).toBe('not_allowed')
    expect(await host.link!.receives('relay.envelope')).toBe(false)
  })

  it('a host cannot send as another machine: hq refuses it, and the Fleet Console never sees it', async () => {
    const other = await generateHostKeys('host')
    const envelope = await sealEnvelope({ sender: other, recipient: fleetConsole.keys.identity, message: figuresRead() })
    host.link!.send('relay.envelope', { envelope })

    const refused = await host.link!.next('relay.undeliverable', f => f.payload.envelopeId === envelope.id)
    expect(refused.payload.reason).toBe('not_allowed')
    expect(await fleetConsole.link.receives('relay.envelope')).toBe(false)
  })

  it('an envelope to a machine hq does not know is refused as such', async () => {
    const unknown = await generateHostKeys('host')
    const envelope = await fleetConsole.seal(unknown.identity, figuresRead())
    fleetConsole.link.send('relay.envelope', { envelope })
    const refused = await fleetConsole.link.next('relay.undeliverable', f => f.payload.envelopeId === envelope.id)
    expect(refused.payload.reason).toBe('unknown_recipient')
  })
})

describe('a disconnected machine @SC-923', () => {
  it('has its link closed at once, is refused when it dials again, and is no longer a recipient', async () => {
    const link = host.link!
    expect(await fleetConsole.call('host.disconnect', { hostId })).toEqual({ disconnected: true })
    await link.next('revoke')
    expect(await link.closed).toBe(4003)
    await expect(host.connect()).rejects.toMatchObject({ status: 401 })

    const envelope = await fleetConsole.seal(hostIdentity, figuresRead())
    fleetConsole.link.send('relay.envelope', { envelope })
    const refused = await fleetConsole.link.next('relay.undeliverable', f => f.payload.envelopeId === envelope.id)
    expect(refused.payload.reason).toBe('unknown_recipient')
  })
})

describe('signing in to the Fleet Console: hq answers by the fleet admin role @SC-921', () => {
  it('an organisation admin without the role is told so; the machine admin grants it, and the same sign-in now holds it', async () => {
    const before = await fleetConsole.call('signIn.check', { username: 'e2e-admin', password: 'E2eAdmin!2026' })
    expect(before).toMatchObject({ ok: true, user: { fleetAdmin: false } })

    const granted = await runHqMachineCommand('fleet-admin', ['e2e-admin'])
    expect(granted.ok, granted.error).toBe(true)

    const after = await fleetConsole.call('signIn.check', { username: 'e2e-admin', password: 'E2eAdmin!2026' })
    expect(after).toMatchObject({ ok: true, user: { id: before.user.id, fleetAdmin: true } })
    const row = await hqDb.user.findUniqueOrThrow({ where: { id: before.user.id }, select: { fleetAdmin: true } })
    expect(row.fleetAdmin).toBe(true)

    const { admins } = await fleetConsole.call('fleetAdmin.list', {})
    expect(admins.map((a: { username: string }) => a.username)).toEqual(['e2e-admin'])
  })

  it('a member without the role is told so, and a wrong password is refused without saying more', async () => {
    expect(await fleetConsole.call('signIn.check', { username: 'e2e-operator', password: 'E2eOperator!2026' }))
      .toMatchObject({ ok: true, user: { fleetAdmin: false } })
    expect(await fleetConsole.call('signIn.check', { username: 'e2e-admin', password: 'not the password' })).toEqual({ ok: false })
  })
})
