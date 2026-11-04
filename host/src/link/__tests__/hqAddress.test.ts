/**
 * The machine following hq to a new address (host-management spec §13): told over the host link, or pointed by
 * `console hq-address`, it moves its pin only once the new address passes the move check on its credential.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { MOVE_CHECK_PATH, type HostIdentity } from '@agenthix/core'
import { fingerprintOf, generateHostKeys } from '@agenthix/core/host-crypto'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { Refusal } from '../../owner/results'
import { HostAddressFollower, readMove } from '../addressFollow'
import { pointMachine } from '../pointMachine'
import { readPin, writePin } from '../pin'
import { hqStandIn, nothingAt, type HqStandIn } from './moveCheckHq'

const flat = (text: string) => text.replace(/\s+/g, ' ')
const CREDENTIAL = 'hmc_' + 'ab'.repeat(30)
const OLD = 'http://192.168.1.20:4100'

let m: FakeMachine
let redials: number
let stands: HqStandIn[]
let logs: string[]
let fleetConsole: { identity: HostIdentity; fingerprint: string }

beforeAll(async () => {
  const keys = await generateHostKeys('console')
  fleetConsole = { identity: keys.identity, fingerprint: await fingerprintOf(keys.identity) }
})

function pin(local = false) {
  writePin(m.ctx.state, {
    console: fleetConsole.identity as never, consoleFingerprint: fleetConsole.fingerprint,
    hqAddress: OLD, hostId: 'h1', machineCredential: CREDENTIAL, pinnedAt: '2026-10-14T09:00:00.000Z', local,
  })
}

async function stand(credentials: string[], claims?: string) {
  const s = await hqStandIn(credentials, claims)
  stands.push(s)
  return s
}

function follower() {
  return new HostAddressFollower({
    state: m.ctx.state, redial: () => { redials++ }, now: () => new Date('2026-10-14T09:12:00Z'),
    later: () => () => {}, log: line => logs.push(line),
  })
}

beforeEach(() => {
  m = fakeMachine()
  redials = 0
  stands = []
  logs = []
  m.ctx.link = { start: () => { redials++ }, stop: () => {}, connected: () => false, sendEnvelope: () => false }
})
afterEach(async () => {
  await Promise.all(stands.map(s => s.close()))
  m.cleanup()
})

describe('a machine told hq moves @SC-856', () => {
  it('keeps its pin while the new address does not answer, and moves it once the address passes the check', async () => {
    pin()
    let address = await nothingAt()
    const f = follower()
    f.take(address)
    expect(readMove(m.ctx.state)).toMatchObject({ from: OLD, to: address, problem: null })
    expect(await f.tryNow()).toBe('unreachable')
    expect(readPin(m.ctx.state)?.hqAddress).toBe(OLD)
    expect(readMove(m.ctx.state)?.problem).toBe('unreachable')

    const real = await stand([CREDENTIAL])
    address = real.address
    f.take(address)
    expect(await f.tryNow()).toBe('passed')
    expect(readPin(m.ctx.state)?.hqAddress).toBe(address)
    expect(readMove(m.ctx.state)).toBeNull()
    expect(redials).toBe(1)
  })

  it('stays when the new address does not hold its record, which hears nothing more and never the credential', async () => {
    pin()
    const stranger = await stand(['hmc_someone_else_' + 'x'.repeat(40)])
    const f = follower()
    f.take(stranger.address)
    expect(await f.tryNow()).toBe('notThisHq')
    expect(readPin(m.ctx.state)?.hqAddress).toBe(OLD)
    expect(stranger.requests.map(r => r.path)).toEqual([MOVE_CHECK_PATH])
    expect(JSON.stringify(stranger.requests)).not.toContain(CREDENTIAL)
    expect(redials).toBe(0)
  })

  it('does not follow a real hq answering for another address', async () => {
    pin()
    const relayed = await stand([CREDENTIAL], 'https://hq.acme.example')
    const f = follower()
    f.take(relayed.address)
    expect(await f.tryNow()).toBe('notThisHq')
    expect(readPin(m.ctx.state)?.hqAddress).toBe(OLD)
  })

  it("takes no notice on hq's own machine, of an address it would send its credential to in the clear, or of no address", () => {
    pin(true)
    follower().take('http://192.168.1.30:4100')
    expect(readMove(m.ctx.state)).toBeNull()
    pin()
    follower().take('http://hq.acme.example')
    follower().take(42)
    expect(readMove(m.ctx.state)).toBeNull()
    expect(logs.join('\n')).toMatch(/will not follow: plain http/)
  })

  it("takes no notice on hq's own machine after a hand-over, when the pin is no longer marked local", () => {
    pin()
    m.ctx.state.writeJson(['hq', 'settings.json'], { version: 'dev' })
    follower().take('https://hq.acme.example')
    expect(readMove(m.ctx.state)).toBeNull()
  })

  it('stops waiting when told the address it already has', async () => {
    pin()
    const f = follower()
    f.take('http://192.168.1.30:4100')
    f.take(`${OLD}/`)
    expect(readMove(m.ctx.state)).toBeNull()
    expect(await f.tryNow()).toBeNull()
  })
})

describe('console hq-address @SC-856', () => {
  it('points the machine once the check passes, and the Fleet Console installed here after its own check', async () => {
    pin()
    const real = await stand([CREDENTIAL])
    m.ctx.state.writeJson(['console', 'settings.json'], { version: '0.2.0', hqAddress: OLD, onHqMachine: false, installedAt: 'x' })
    m.up.add('agenthix-console')
    m.consoleAnswers[real.address] = { address: real.address, outcome: 'passed' }
    const notes: string[] = []
    const r = await pointMachine(m.ctx, real.address, p => { if (p.event === 'note') notes.push(p.text); if (p.event === 'stepDone') notes.push(p.outcome) })
    expect(r).toMatchObject({ address: real.address, previous: OLD, console: 'here', siteNeedsAddress: null })
    expect(readPin(m.ctx.state)?.hqAddress).toBe(real.address)
    expect(redials).toBe(1)
    expect(flat(notes.join('\n'))).toContain('The credential itself never crosses the network.')
    expect(notes).toContain('passes')
  })

  it('refuses, in words, an address that fails the check, changing nothing', async () => {
    pin()
    const stranger = await stand(['hmc_someone_else_' + 'x'.repeat(40)])
    const err = await pointMachine(m.ctx, stranger.address, () => {}).catch(e => e)
    expect(err).toBeInstanceOf(Refusal)
    expect(flat(err.message)).toContain(`Not changed: ${stranger.address} is an Agenthix HQ, but not the one this machine belongs to`)
    expect(flat(err.message)).toContain(`This machine still uses ${OLD} and told it nothing.`)
    expect(readPin(m.ctx.state)?.hqAddress).toBe(OLD)
    expect(redials).toBe(0)

    const down = await nothingAt()
    const none = await pointMachine(m.ctx, down, () => {}).catch(e => e)
    expect(flat(none.message)).toBe(`Not changed: nothing answers at ${down}. HQ may not have finished moving. Try again later.`)
  })

  it("refuses on hq's machine, on a machine with no Fleet Console, and an address in the clear", async () => {
    expect((await pointMachine(m.ctx, 'http://192.168.1.30:4100', () => {}).catch(e => e)).code).toBe('not_installed')
    pin(true)
    expect((await pointMachine(m.ctx, 'http://192.168.1.30:4100', () => {}).catch(e => e)).message).toMatch(/HQ runs on hq-box/)
    pin()
    expect((await pointMachine(m.ctx, 'http://hq.acme.example', () => {}).catch(e => e)).message).toMatch(/plain http/)
  })
})
