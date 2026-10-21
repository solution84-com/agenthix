import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HOST_ID_HEADER, HOST_JOIN_LOOKUP_HEADER, HOST_PROTOCOL_VERSION_HEADER, type CloudResult } from '@agenthix/core'
import { EnvelopeReplayGuard, cloudJoinBinding, cloudJoinLookup, consoleJoinBinding, fingerprintOf } from '@agenthix/core/host-crypto'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { StandInCloud } from '../../__tests__/standInCloud'
import { hostKeys } from '../../identity/identity'
import { readCloudBinding } from '../../link/cloudController'
import { joinConsole } from '../../link/join'
import { writePin } from '../../link/pin'
import { FakeConsole, FakeRelay } from '../../link/__tests__/fakeRelay'
import type { CloudSettings } from '../../config'
import { cloudStatus, startCloud, type CloudDeps } from '../start'

const me = process.getuid?.() ?? 0
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))
let m: FakeMachine
let cloud: StandInCloud
let file: string
let logs: string[]
let asked: unknown[]
let handle: ReturnType<typeof startCloud>

const settings = (o: Partial<CloudSettings> = {}): CloudSettings => ({ url: 'https://cloud.example', machineId: 'machine-1', enrolmentCodeFile: file, ...o })

function start(o: Partial<CloudDeps> = {}) {
  handle = startCloud({
    state: m.ctx.state, settings: settings(), keys: () => hostKeys(m.ctx.state), machineName: 'hq-box', dial: cloud.dial,
    operate: async (r): Promise<CloudResult> => { asked.push(r); return { ok: true, op: 'figures.read', result: {} as never } },
    log: l => logs.push(l), now: () => new Date(), sleep: () => tick(), codeOwnerUid: me, replay: new EnvelopeReplayGuard(0), ...o,
  })
  return handle
}

function writeCode(code = cloud.code): void {
  fs.writeFileSync(file, `${code}\n`, { mode: 0o600 })
}

beforeEach(async () => {
  m = fakeMachine()
  cloud = await StandInCloud.make({ machineId: 'machine-1' })
  file = path.join(m.dir, 'enrolment-code')
  logs = []
  asked = []
  handle = null
})
afterEach(() => {
  handle?.stop()
  m.cleanup()
})

describe('enrolling with Cloud @B2 @SC-1056', () => {
  it('pins Cloud\'s identity, deletes the code file, and reconnects by machine id with no secret', async () => {
    writeCode()
    expect(await start()!.enrolled).toBe(true)
    expect(readCloudBinding(m.ctx.state)).toMatchObject({ identity: cloud.identity, machineId: 'machine-1' })
    expect(fs.existsSync(file)).toBe(false)

    const join = cloud.connections[0]
    expect(join.url).toBe('wss://cloud.example/host-link')
    expect(join.headers).toEqual({ [HOST_PROTOCOL_VERSION_HEADER]: expect.stringMatching(/^1\./), [HOST_JOIN_LOOKUP_HEADER]: await cloudJoinLookup(cloud.code) })
    expect(cloud.joins[0]).toMatchObject({ machineId: 'machine-1', identity: (await hostKeys(m.ctx.state)).identity })

    const conn = await cloud.connected()
    expect(conn.headers).toEqual({ [HOST_PROTOCOL_VERSION_HEADER]: expect.stringMatching(/^1\./), [HOST_ID_HEADER]: 'machine-1' })
    expect(await cloud.ask({ op: 'figures.read' })).toMatchObject({ ok: true, op: 'figures.read' })
    expect(asked).toEqual([{ op: 'figures.read' }])

    // The code itself never travels, and is never logged.
    const everything = JSON.stringify(cloud.connections.map(c => c.sent)) + logs.join('\n')
    expect(everything).not.toContain(cloud.code)
    expect(await cloudStatus(m.ctx.state, settings())).toMatchObject({ enrolled: true, machineId: 'machine-1', connected: true })
  })

  it('on a refusal pins nothing, spends the code, and says why', async () => {
    writeCode()
    cloud.refuseJoin = 'expired'
    expect(await start()!.enrolled).toBe(false)
    expect(readCloudBinding(m.ctx.state)).toBeNull()
    expect(fs.existsSync(file)).toBe(false)
    expect(await cloudStatus(m.ctx.state, settings())).toMatchObject({ enrolled: false, problem: expect.stringContaining('expired') })
    expect(logs.join('\n')).not.toContain(cloud.code)
  })

  it('pins nothing when Cloud\'s answer is a Fleet Console\'s binding under the same code', async () => {
    writeCode()
    cloud.answerJoin = async join => ({
      machineId: 'machine-1',
      acceptance: { identity: cloud.identity, binding: await consoleJoinBinding(cloud.code, cloud.fingerprint, await fingerprintOf(join.identity)) },
    })
    expect(await start()!.enrolled).toBe(false)
    expect(readCloudBinding(m.ctx.state)).toBeNull()
    expect(fs.existsSync(file)).toBe(false)
  })

  it('pins nothing when Cloud answers for another machine than the one its settings name', async () => {
    writeCode()
    cloud.answerJoin = async join => ({
      machineId: 'machine-2',
      acceptance: { identity: cloud.identity, binding: await cloudJoinBinding(cloud.code, cloud.fingerprint, await fingerprintOf(join.identity), 'machine-2') },
    })
    expect(await start()!.enrolled).toBe(false)
    expect(readCloudBinding(m.ctx.state)).toBeNull()
  })

  it('tries again, without spending the code, while a connection never opens', async () => {
    writeCode()
    let first = true
    const dial: CloudDeps['dial'] = (url, headers, events) => {
      if (!first) return cloud.dial(url, headers, events)
      first = false
      setTimeout(() => events.close(), 0)
      return { send: () => {}, close: () => {} }
    }
    expect(await start({ dial })!.enrolled).toBe(true)
    expect(cloud.joins).toHaveLength(1)
  })

  it('is refused while a Fleet Console is pinned, and the code is left alone @SC-1058', async () => {
    writeCode()
    const fleetConsole = await FakeConsole.make()
    writePin(m.ctx.state, {
      console: fleetConsole.keys.identity as never, consoleFingerprint: fleetConsole.fingerprint, hqAddress: 'https://hq.acme.example',
      hostId: 'h1', machineCredential: 'hmc_0123456789abcdef', pinnedAt: new Date().toISOString(), local: false,
    })
    expect(await start()!.enrolled).toBe(false)
    expect(cloud.connections).toEqual([])
    expect(fs.existsSync(file)).toBe(true)
    expect(await cloudStatus(m.ctx.state, settings())).toMatchObject({ problem: expect.stringContaining('one controller at a time') })
  })

  it('does nothing at all without CLOUD_URL, and nothing over plain http to another machine', () => {
    expect(start({ settings: null })).toBeNull()
    expect(start({ settings: settings({ url: 'http://cloud.example' }) })).toBeNull()
    expect(cloud.connections).toEqual([])
  })
})

describe('a Cloud code and a Fleet Console join are kept apart @SC-1056', () => {
  it('a Cloud code presented as a Fleet Console join is not admitted', async () => {
    const outcome = await joinConsole({
      address: 'https://cloud.example', code: cloud.code, keys: await hostKeys(m.ctx.state), machineName: 'hq-box',
      dial: cloud.dial, now: () => new Date(), timeoutMs: 5_000,
    })
    expect(outcome).toEqual({ ok: false, reason: 'notAccepted' })
    expect(cloud.joins).toEqual([])
  })

  it('a Fleet Console join answered with Cloud\'s binding under the same code pins nothing', async () => {
    const relay = new FakeRelay()
    const code = cloud.code
    const asConsole = { ...cloud.identity, role: 'console' as const }
    relay.onJoin = async (join, conn) => {
      // Over the very fingerprints the Fleet Console's check uses: only the `cloud` role's label tells them apart.
      const binding = await cloudJoinBinding(code, await fingerprintOf(asConsole), await fingerprintOf(join.identity), '')
      await conn.deliver('host.joined', { hostId: 'h1', machineCredential: 'hmc_0123456789abcdef', acceptance: { identity: asConsole, binding } })
    }
    const outcome = await joinConsole({
      address: 'https://hq.acme.example', code, keys: await hostKeys(m.ctx.state), machineName: 'hq-box', dial: relay.dial,
      now: () => new Date(), timeoutMs: 5_000,
    })
    expect(outcome).toEqual({ ok: false, reason: 'badBinding' })
  })
})
