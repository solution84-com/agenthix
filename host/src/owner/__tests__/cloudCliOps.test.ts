import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { writeAndStartConsole } from '../../install/console'
import { recordPorts } from '../../state/installation'
import { forgetRemoteAccess } from '../../remoteAccess/state'
import { resumeRemoteAccess } from '../../remoteAccess/handlers'
import { ownerHandler } from '../dispatch'
import { parseOwnerRequest } from '../requests'

// The machine admin's Cloud commands on the owner socket: the connection asked of hq, remote access off, and a fleet
// admin's authenticator forgotten in the Fleet Console by the id hq gives.

let m: FakeMachine
let sent: { command: string; input: unknown }[]

const ask = (request: unknown) => ownerHandler(m.ctx)(request, () => {})

beforeEach(async () => {
  m = fakeMachine()
  await install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
  recordPorts(m.ctx.state, { console: 7801 })
  await writeAndStartConsole(m.ctx, {
    version: '0.2.0', images: {}, hqAddress: 'http://127.0.0.1:4100', onHqMachine: true, installedAt: '2026-10-14T09:00:00.000Z',
  }, { pairingSecret: 'p'.repeat(64) })
  sent = []
  const exec = m.ctx.docker.exec.bind(m.ctx.docker)
  vi.spyOn(m.ctx.docker, 'exec').mockImplementation(async (container, command, input, timeout) => {
    if (command.includes('/app/dist/cli.js')) sent.push({ command: command[command.length - 1]!, input: input ? JSON.parse(input) : null })
    return exec(container, command, input, timeout)
  })
})
afterEach(() => {
  forgetRemoteAccess(m.ctx)
  resumeRemoteAccess(m.ctx)
  vi.restoreAllMocks()
  m.cleanup()
})

describe("the machine admin's Cloud commands @SC-1126", () => {
  it('reads each request field by field', () => {
    expect(parseOwnerRequest({ op: 'hq.cloudConnection', action: 'connect' })).toEqual({ ok: true, request: { op: 'hq.cloudConnection', action: 'connect' } })
    expect(parseOwnerRequest({ op: 'hq.cloudConnection', action: 'approve' })).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
    expect(parseOwnerRequest({ op: 'console.resetCode', user: ' sam ' })).toEqual({ ok: true, request: { op: 'console.resetCode', user: 'sam' } })
    expect(parseOwnerRequest({ op: 'console.resetCode' })).toMatchObject({ ok: false })
    expect(parseOwnerRequest({ op: 'console.remoteOff', extra: 1 })).toEqual({ ok: true, request: { op: 'console.remoteOff' } })
  })

  it("passes the connection to hq's control socket, and its refusals by code", async () => {
    m.hq['cloud-connection'] = { ok: true, text: 'Not connected.', data: { connection: null, connecting: null, lastAttempt: null, runByCloud: false } }
    expect(await ask({ op: 'hq.cloudConnection', action: 'state' })).toMatchObject({ ok: true, result: { state: { connection: null, runByCloud: false } } })
    m.hq['cloud-connection'] = { ok: false, error: 'HQ runs on Agenthix Cloud, so its connection to Cloud stays while Cloud runs it.', code: 'conflict' }
    expect(await ask({ op: 'hq.cloudConnection', action: 'disconnect' })).toMatchObject({ ok: false, refusal: { code: 'conflict' } })
  })

  it('turns remote access off, whether or not the Fleet Console answers', async () => {
    m.consoleAnswers['remote-off'] = { on: false }
    expect(await ask({ op: 'console.remoteOff' })).toEqual({ ok: true, op: 'console.remoteOff', result: { on: false } })
    expect(sent.map(s => s.command)).toEqual(['remote-off'])
    delete m.consoleAnswers['remote-off']
    expect(await ask({ op: 'console.remoteOff' })).toMatchObject({ ok: true, result: { on: false } })
  })

  it("forgets a fleet admin's authenticator by the id hq gives, and refuses one hq does not know", async () => {
    m.hq['fleet-admin-id'] = { ok: true, text: 'u-sam', data: { userId: 'u-sam' } }
    m.consoleAnswers['remote-authenticator-reset'] = { reset: true }
    expect(await ask({ op: 'console.resetCode', user: 'sam' })).toEqual({ ok: true, op: 'console.resetCode', result: { reset: true } })
    expect(sent).toEqual([{ command: 'remote-authenticator-reset', input: { userId: 'u-sam' } }])
    m.hq['fleet-admin-id'] = { ok: false, error: "No active fleet admin signs in as 'avery'.", code: 'not_found' }
    expect(await ask({ op: 'console.resetCode', user: 'avery' })).toMatchObject({ ok: false, refusal: { code: 'not_found' } })
    expect(sent).toHaveLength(1)
  })
})
