/**
 * A Fleet Console retired while its machine was outside the fleet (spec §7): no certificate tells that machine, so
 * nothing removes it by itself. `status` says HQ refuses it, and the machine admin takes it away with
 * `console remove`, asked first; HQ's word alone never removes it.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { ownerHandler } from '../../owner/dispatch'
import { writeAndStartConsole } from '../../install/console'
import { recordPorts } from '../../state/installation'
import { writePin } from '../../link/pin'
import { FakeConsole } from '../../link/__tests__/fakeRelay'
import { parseCommand } from '../commands'
import { runCommand, type Io, type Send } from '../run'

let m: FakeMachine
let here: FakeConsole
let out: string
let err: string
let answers: (string | null)[]

const io: Io = {
  out: t => { out += `${t}\n` },
  write: t => { out += t },
  err: t => { err += `${t}\n` },
  ask: async () => (answers.length ? answers.shift()! : null),
}

const send: Send = (request, onProgress) => ownerHandler(m.ctx)(request, onProgress) as Promise<Record<string, unknown>>
const cli = (...argv: string[]) => runCommand(parseCommand(argv), send, io, '0.2.0', () => new Date('2026-10-14T09:00:00Z'))
const flat = (s: string) => s.replace(/\s+/g, ' ')

const says = (hq: 'connected' | 'refused' | 'notConnected') => {
  m.consoleAnswers['handover-status'] = { state: 'fresh', fingerprint: here.fingerprint, hq }
}
const removed = () => m.calls.some(c => c[0] === 'compose' && c.includes('agenthix-console') && c.includes('down') && c.includes('--volumes'))
const settingsKept = () => m.ctx.state.readJson('console', 'settings.json') !== null

function pinTo(fleetConsole: FakeConsole, local = false) {
  writePin(m.ctx.state, {
    console: fleetConsole.keys.identity as never, consoleFingerprint: fleetConsole.fingerprint, hqAddress: 'https://hq.acme.example',
    hostId: 'h1', machineCredential: 'hmc_0123456789abcdef', pinnedAt: '2026-10-14T09:00:00.000Z', local,
  })
}

beforeEach(async () => {
  m = fakeMachine()
  here = await FakeConsole.make()
  out = ''
  err = ''
  answers = []
  m.ctx.link = { start: () => {}, stop: () => {}, connected: () => true, sendEnvelope: () => {} }
})
afterEach(() => m.cleanup())

describe('a Fleet Console on a machine outside the fleet @SC-853', () => {
  beforeEach(async () => {
    recordPorts(m.ctx.state, { console: 7801 })
    await writeAndStartConsole(m.ctx, {
      version: '0.2.0', images: {}, hqAddress: 'https://hq.acme.example', onHqMachine: false, installedAt: '2026-10-14T09:00:00.000Z',
    }, { hqCode: '4HQWN7TEM9S3' })
    m.calls.length = 0
  })

  it('status says HQ refuses it, that it may have been retired, and how to take it away', async () => {
    says('refused')
    await cli('status')
    expect(flat(out)).toContain('HQ refuses to let it in')
    expect(flat(out)).toContain('may have been retired')
    expect(flat(out)).toContain('agenthix console remove')
    expect(out).not.toContain('Fleet admins open it here')
    expect(removed()).toBe(false)
  })

  it('status says when it is only not reaching HQ, and says nothing of a retirement', async () => {
    says('notConnected')
    await cli('status')
    expect(flat(out)).toContain('not reaching HQ just now')
    expect(out).not.toContain('retired')
    expect(out).not.toContain('Fleet admins open it here')
  })

  it('status is as before while HQ lets it in', async () => {
    says('connected')
    await cli('status')
    expect(flat(out)).toContain('Running. Fleet admins open it here')
  })

  it('console remove asks first, saying its keys go and machines that answer it connect again, then takes it away', async () => {
    says('refused')
    answers = ['y']
    expect(await cli('console', 'remove')).toBe(0)
    expect(flat(out)).toContain('most likely retired')
    expect(flat(out)).toContain('deletes its keys')
    expect(flat(out)).toContain('agenthix console connect')
    expect(removed()).toBe(true)
    expect(settingsKept()).toBe(false)
    expect(flat(out)).toContain('Taken away.')
    out = ''
    await cli('status')
    expect(out).not.toContain('Fleet Console  ')
  })

  it('console remove changes nothing when the answer is no', async () => {
    says('refused')
    answers = ['n']
    expect(await cli('console', 'remove')).not.toBe(0)
    expect(removed()).toBe(false)
    expect(settingsKept()).toBe(true)
  })

  it('console remove warns that HQ still lets it in, when it does', async () => {
    says('connected')
    expect(await cli('console', 'remove', '--yes')).toBe(0)
    expect(flat(out)).toContain('HQ still lets the Fleet Console on hq-box in')
    expect(removed()).toBe(true)
  })

  it('console remove takes away one that does not answer at all', async () => {
    expect(await cli('console', 'remove', '--yes')).toBe(0)
    expect(removed()).toBe(true)
  })

  it('console remove refuses while this machine answers the Fleet Console here', async () => {
    says('connected')
    pinTo(here)
    expect(await cli('console', 'remove', '--yes')).toBe(1)
    expect(flat(err)).toContain('agenthix console disconnect')
    expect(removed()).toBe(false)
  })

  it('the host service removes nothing unless the person agreed', async () => {
    says('refused')
    const answer = await send({ op: 'console.remove' }, () => {})
    expect(answer).toMatchObject({ ok: true, result: { machine: 'hq-box', hq: 'refused' } })
    expect(removed()).toBe(false)
    expect(settingsKept()).toBe(true)
  })

  it('console install points to console remove when the one here is refused by HQ', async () => {
    says('refused')
    expect(await cli('console', 'install', 'https://hq.acme.example', '4HQW-N7TE-M9S3', '--yes')).toBe(1)
    expect(flat(err)).toContain('Nothing was changed.')
    expect(flat(err)).toContain('agenthix console remove')
    expect(removed()).toBe(false)
  })
})

describe('console remove elsewhere @SC-853', () => {
  it('says no Fleet Console runs here, and asks nothing', async () => {
    expect(await cli('console', 'remove')).toBe(1)
    expect(flat(err)).toContain('No Fleet Console runs on hq-box. Nothing was changed.')
  })

  it('refuses on HQ’s machine while HQ’s machine answers the Fleet Console here: it is the fleet’s own', async () => {
    await cli('install', '--address', 'https://hq.acme.example')
    pinTo(here, true)
    m.calls.length = 0
    expect(await cli('console', 'remove', '--yes')).toBe(1)
    expect(flat(err)).toContain("the fleet's own")
    expect(flat(err)).toContain('agenthix hq console-code')
    expect(removed()).toBe(false)
  })

  it('is read as a command', () => {
    expect(parseCommand(['console', 'remove'])).toEqual({ kind: 'consoleRemove', yes: false })
    expect(parseCommand(['console', 'remove', '--yes'])).toEqual({ kind: 'consoleRemove', yes: true })
    expect(parseCommand(['console', 'remove', 'machine-b'])).toMatchObject({ kind: 'usage' })
  })
})
