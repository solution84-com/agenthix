import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseHostRequest, type HostIdentity } from '@agenthix/core'
import { generateHostKeys } from '@agenthix/core/host-crypto'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { cloudOperation } from '../../cloud/dispatch'
import { CLOUD_ONLY_HANDLERS } from '../../cloud/handlers'
import { writeAndStartConsole } from '../../install/console'
import { recordPorts } from '../../state/installation'
import { pinCloudController } from '../../link/cloudController'
import { endRemoteAccess, resumeRemoteAccess } from '../handlers'
import { forgetRemoteAccess, keptRemoteAccess, remoteAccessPort } from '../state'

let m: FakeMachine
let sent: { command: string; input: unknown }[]

const PAIRING = 'p'.repeat(64)
const inMinutes = (min: number) => new Date(m.ctx.now().getTime() + min * 60_000).toISOString()
const CERT = '-----BEGIN CERTIFICATE-----\nMIIBAAAA\n-----END CERTIFICATE-----\n'
const on = (over: Record<string, unknown> = {}) => ({
  op: 'remoteAccess.on', name: 'fc-1.console.example', port: 8443, certificate: CERT, until: inMinutes(120), allow: ['203.0.113.7/32'], ...over,
})
const hashes = Array.from({ length: 10 }, (_, i) => i.toString(16).repeat(64))

function composePorts(): string[] {
  const compose = m.ctx.state.readJson('console', 'compose.json') as { services: { console: { ports: string[]; environment: Record<string, string> } } }
  return compose.services.console.ports
}

async function enrol(machine: FakeMachine): Promise<void> {
  const keys = await generateHostKeys('cloud')
  await pinCloudController(machine.ctx.state, { identity: keys.identity as HostIdentity & { role: 'cloud' }, machineId: 'm-1', pinnedAt: new Date().toISOString() })
}

beforeEach(async () => {
  m = fakeMachine()
  await enrol(m)
  recordPorts(m.ctx.state, { console: 7801 })
  await writeAndStartConsole(m.ctx, {
    version: '0.2.0', images: {}, hqAddress: 'http://127.0.0.1:4100', onHqMachine: true, installedAt: '2026-10-14T09:00:00.000Z',
  }, { pairingSecret: PAIRING })
  m.consoleAnswers['remote-csr'] = { csr: '-----BEGIN CERTIFICATE REQUEST-----\nAAAA\n-----END CERTIFICATE REQUEST-----\n' }
  m.consoleAnswers['remote-off'] = { on: false }
  m.consoleAnswers['remote-authenticator-add'] = { added: true }
  sent = []
  const exec = m.ctx.docker.exec.bind(m.ctx.docker)
  vi.spyOn(m.ctx.docker, 'exec').mockImplementation(async (container, command, input, timeout) => {
    if (command.includes('/app/dist/cli.js')) sent.push({ command: command[command.length - 1]!, input: input ? JSON.parse(input) : null })
    if (command.at(-1) === 'remote-on') m.consoleAnswers['remote-on'] = { on: true, until: (JSON.parse(input) as { until: string }).until }
    return exec(container, command, input, timeout)
  })
})
afterEach(() => {
  forgetRemoteAccess(m.ctx)
  resumeRemoteAccess(m.ctx)
  m.cleanup()
})

describe('remote access, asked by Cloud on a machine it runs @SC-1066', () => {
  it('has a handler for each of its four operations', () => {
    expect(Object.keys(CLOUD_ONLY_HANDLERS)).toEqual(expect.arrayContaining(['remoteAccess.csr', 'remoteAccess.on', 'remoteAccess.off', 'remoteAccess.authenticator.add']))
  })

  it('is refused on a machine not enrolled with Cloud, and asks nothing of the Fleet Console', async () => {
    const other = fakeMachine()
    try {
      for (const request of [on(), { op: 'remoteAccess.csr', name: 'fc-1.console.example' }, { op: 'remoteAccess.off' }]) {
        expect(await cloudOperation(other.ctx, request)).toMatchObject({ ok: false, refusal: { code: 'conflict' } })
      }
      expect(other.calls.some(c => c[0] === 'exec')).toBe(false)
    } finally {
      other.cleanup()
    }
  })

  it('is not in what a Fleet Console may ask', () => {
    for (const op of ['remoteAccess.on', 'remoteAccess.off', 'remoteAccess.csr', 'remoteAccess.authenticator.add']) {
      expect(parseHostRequest({ ...on(), op })).toMatchObject({ ok: false, refusal: { code: 'unknown_operation' } })
    }
  })

  it('csr: the Fleet Console makes the key and answers the request for the name', async () => {
    expect(await cloudOperation(m.ctx, { op: 'remoteAccess.csr', name: 'fc-1.console.example' })).toEqual({
      ok: true, op: 'remoteAccess.csr', result: { csr: expect.stringMatching(/^-----BEGIN CERTIFICATE REQUEST-----/) },
    })
    expect(sent).toEqual([{ command: 'remote-csr', input: { name: 'fc-1.console.example' } }])
    expect(await cloudOperation(m.ctx, { op: 'remoteAccess.csr', name: '*.example' })).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
  })

  it('on: hands the checked request to the Fleet Console, publishes the one port and keeps its end', async () => {
    const r = on()
    expect(await cloudOperation(m.ctx, r)).toEqual({ ok: true, op: 'remoteAccess.on', result: { on: true, until: r.until } })
    const { op: _op, ...request } = r
    expect(sent).toEqual([{ command: 'remote-on', input: request }])
    expect(composePorts()).toEqual(['127.0.0.1:7801:4301', '8443:8443'])
    const compose = m.ctx.state.readJson('console', 'compose.json') as { services: { console: { environment: Record<string, string> } } }
    expect(compose.services.console.environment.HQ_CONSOLE_PAIRING_SECRET).toBe(PAIRING)
    expect(keptRemoteAccess(m.ctx)).toEqual({ port: 8443, until: r.until })
  })

  it.each([
    ['more than 20 addresses', { allow: Array.from({ length: 21 }, (_, i) => `198.51.100.${i}/32`) }],
    ['a wider network', { allow: ['198.51.100.0/24'] }],
    ['no address', { allow: [] }],
    ['port 443', { port: 443 }],
    ['port 80', { port: 80 }],
    ['an end that has passed', { until: '2026-10-14T08:00:00.000Z' }],
    ['an end more than 8 hours away', { until: '2026-10-14T17:30:00.000Z' }],
    ['a key in place of a certificate', { certificate: '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n' }],
  ])('on: refuses %s, and asks nothing of the Fleet Console', async (_what, over) => {
    expect(await cloudOperation(m.ctx, on(over))).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
    expect(sent).toEqual([])
    expect(composePorts()).toEqual(['127.0.0.1:7801:4301'])
  })

  it('on: refused, the Fleet Console told nothing, when the port is held on the machine @SC-1244', async () => {
    m.heldPorts.add(8443)
    expect(await cloudOperation(m.ctx, on())).toMatchObject({
      ok: false, refusal: { code: 'conflict', message: "Port 8443, for the Fleet Console's remote access, is held by a program on this machine, not by a container. Ask for remote access on another port. Nothing was changed." },
    })
    expect(sent).toEqual([])
    expect(keptRemoteAccess(m.ctx)).toBeNull()
  })

  it('on again while on: replaces all of it, the old port closed', async () => {
    await cloudOperation(m.ctx, on())
    await cloudOperation(m.ctx, on({ port: 9443, allow: ['2001:db8:1:2::/64'] }))
    expect(composePorts()).toEqual(['127.0.0.1:7801:4301', '9443:9443'])
    expect((sent[1]!.input as { allow: string[] }).allow).toEqual(['2001:db8:1:2::/64'])
  })

  it('on: when the port cannot be published, remote access is off again', async () => {
    vi.spyOn(m.ctx.docker, 'composeUp').mockRejectedValueOnce(new Error('port is already allocated'))
    expect(await cloudOperation(m.ctx, on())).toMatchObject({ ok: false, refusal: { code: 'failed', message: expect.stringMatching(/Remote access is off/) } })
    expect(sent.map(s => s.command)).toEqual(['remote-on', 'remote-off'])
    expect(keptRemoteAccess(m.ctx)).toBeNull()
    expect(composePorts()).toEqual(['127.0.0.1:7801:4301'])
  })

  it('off: stops now, the port closed even when the Fleet Console does not answer', async () => {
    await cloudOperation(m.ctx, on())
    delete m.consoleAnswers['remote-off']
    expect(await cloudOperation(m.ctx, { op: 'remoteAccess.off' })).toEqual({ ok: true, op: 'remoteAccess.off', result: { on: false } })
    expect(sent.map(s => s.command)).toEqual(['remote-on', 'remote-off'])
    expect(composePorts()).toEqual(['127.0.0.1:7801:4301'])
    expect(keptRemoteAccess(m.ctx)).toBeNull()
  })

  it('stops by itself at its end: the port is closed, and no compose file written after it publishes the port', async () => {
    const r = on({ until: inMinutes(30) })
    await cloudOperation(m.ctx, r)
    await endRemoteAccess(m.ctx)
    expect(composePorts()).toContain('8443:8443')
    await m.ctx.sleep(31 * 60_000)
    expect(remoteAccessPort(m.ctx)).toBeNull()
    await endRemoteAccess(m.ctx)
    expect(composePorts()).toEqual(['127.0.0.1:7801:4301'])
    expect(keptRemoteAccess(m.ctx)).toBeNull()
  })

  it('after a restart, ends at once what ended while it was stopped', async () => {
    await cloudOperation(m.ctx, on({ until: inMinutes(30) }))
    await m.ctx.sleep(60 * 60_000)
    resumeRemoteAccess(m.ctx)
    await vi.waitFor(() => expect(composePorts()).toEqual(['127.0.0.1:7801:4301']))
  })

  it('authenticator.add: hands the secret over on standard input only, and answers whether it was added', async () => {
    const request = { op: 'remoteAccess.authenticator.add', id: 'a-1', secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEH', recoveryCodeHashes: hashes, claimBefore: inMinutes(60 * 24) }
    expect(await cloudOperation(m.ctx, request)).toEqual({ ok: true, op: 'remoteAccess.authenticator.add', result: { added: true } })
    expect(sent[0]!.input).toMatchObject({ id: 'a-1', secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEH' })
    expect(m.calls.flat().join(' ')).not.toContain('JBSWY3DPEHPK3PXP')
    expect(await cloudOperation(m.ctx, { ...request, recoveryCodeHashes: hashes.slice(2) })).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
    expect(await cloudOperation(m.ctx, { ...request, secret: 'SHORT' })).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
  })

  it('says so, in the Fleet Console\'s own words, when it refuses', async () => {
    delete m.consoleAnswers['remote-csr']
    expect(await cloudOperation(m.ctx, { op: 'remoteAccess.csr', name: 'fc-1.console.example' })).toMatchObject({
      ok: false, refusal: { code: 'conflict', message: 'The Fleet Console on hq-box refused: HQ is not answering.' },
    })
  })
})
