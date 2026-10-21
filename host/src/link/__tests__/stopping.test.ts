import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HostEnvelope } from '@agenthix/core'
import { parseHostStopping } from '@agenthix/core'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { hostKeys } from '../../identity/identity'
import { writePin } from '../pin'
import { sayStopping, type StoppingLink } from '../stopping'
import { FakeConsole } from './fakeRelay'

let m: FakeMachine
let fleetConsole: FakeConsole
let sent: HostEnvelope[]

const link = (over: Partial<StoppingLink> = {}): StoppingLink => ({
  connected: () => true, sendEnvelope: e => { sent.push(e) }, ...over,
})
const keys = () => hostKeys(m.ctx.state)

beforeEach(async () => {
  m = fakeMachine()
  sent = []
  fleetConsole = await FakeConsole.make()
  writePin(m.ctx.state, {
    console: fleetConsole.keys.identity as never, consoleFingerprint: fleetConsole.fingerprint, hqAddress: 'https://hq.acme.example',
    hostId: 'h1', machineCredential: 'hmc_0123456789abcdef', pinnedAt: '2026-10-14T09:00:00.000Z', local: false,
  })
})
afterEach(() => m.cleanup())

describe('at its stop signal, the host service tells its Fleet Console it stops on purpose @SC-850', () => {
  it('sends one stop word, signed by this machine and sealed to the Fleet Console it pins', async () => {
    expect(await sayStopping({ state: m.ctx.state, keys, link: link() })).toBe(true)
    expect(sent).toHaveLength(1)
    const opened = await fleetConsole.open(sent[0], (await keys()).identity)
    expect(opened.ok && parseHostStopping(opened.message)).toEqual({ kind: 'stopping' })
  })

  it('waits for the word to leave, within the budget', async () => {
    let drained = false
    setTimeout(() => { drained = true }, 50)
    expect(await sayStopping({ state: m.ctx.state, keys, link: link({ drained: () => drained }), budgetMs: 1_000 })).toBe(true)
  })

  it('stops at once when the link is down, or no Fleet Console is pinned: nothing is sent', async () => {
    const started = Date.now()
    expect(await sayStopping({ state: m.ctx.state, keys, link: link({ connected: () => false }) })).toBe(false)
    m.ctx.state.writeJson(['link', 'console.json'], {})
    expect(await sayStopping({ state: m.ctx.state, keys, link: link() })).toBe(false)
    expect(sent).toHaveLength(0)
    expect(Date.now() - started).toBeLessThan(500)
  })

  it('never holds the stop past its budget, however the link behaves', async () => {
    const started = Date.now()
    expect(await sayStopping({ state: m.ctx.state, keys, link: link({ drained: () => false }), budgetMs: 100 })).toBe(false)
    expect(await sayStopping({ state: m.ctx.state, keys: () => new Promise(() => {}), link: link(), budgetMs: 100 })).toBe(false)
    expect(Date.now() - started).toBeLessThan(800)
  })

  it('a link that throws as it sends does not stop the stop', async () => {
    expect(await sayStopping({ state: m.ctx.state, keys, link: link({ sendEnvelope: () => { throw new Error('closed') } }) })).toBe(false)
  })
})
