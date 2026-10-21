/**
 * `hq console-code --no-machines`: recovering when the Fleet Console ran on another machine and that machine is lost.
 * Never the default, and never without the person's word, since every machine must then connect again.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { ownerHandler } from '../../owner/dispatch'
import { readPin, writePin } from '../../link/pin'
import { FakeConsole } from '../../link/__tests__/fakeRelay'
import { parseCommand } from '../commands'
import { runCommand, type Io, type Send } from '../run'

let m: FakeMachine
let out: string
let err: string
let answers: (string | null)[]
let stopped: number

const io: Io = {
  out: t => { out += `${t}\n` },
  write: t => { out += t },
  err: t => { err += `${t}\n` },
  ask: async () => (answers.length ? answers.shift()! : null),
}
const send: Send = (request, onProgress) => ownerHandler(m.ctx)(request, onProgress) as Promise<Record<string, unknown>>
const cli = (...argv: string[]) => runCommand(parseCommand(argv), send, io, '0.2.0', () => new Date('2026-10-14T09:00:00Z'))
const flat = (s: string) => s.replace(/\s+/g, ' ')

beforeEach(async () => {
  m = fakeMachine()
  out = ''
  err = ''
  answers = []
  stopped = 0
  m.ctx.link = { start: () => {}, stop: () => { stopped++ }, connected: () => false, sendEnvelope: () => {} }
  await runCommand(parseCommand(['install', '--address', 'https://hq.acme.example']), send, io, '0.2.0', () => new Date('2026-10-14T09:00:00Z'))
  // The Fleet Console here was handed over to a laptop, which is lost: this machine answers that one.
  m.up.delete('agenthix-console')
  const lost = await FakeConsole.make()
  writePin(m.ctx.state, {
    console: lost.keys.identity as never, consoleFingerprint: lost.fingerprint, hqAddress: 'http://127.0.0.1:4100',
    hostId: 'h1', machineCredential: 'hmc_0123456789abcdef', pinnedAt: '2026-10-14T09:00:00.000Z', local: false,
  })
  m.hq['console-code'] = { ok: true, text: '', data: { code: '4HQWN7TEM9S3', expiresAt: '2026-10-14T10:00:00Z' } }
  out = ''
})
afterEach(() => m.cleanup())

describe('agenthix hq console-code --no-machines @SC-853', () => {
  it('is read only with the flag', () => {
    expect(parseCommand(['hq', 'console-code', '--no-machines'])).toEqual({ kind: 'consoleCode', yes: false, noMachines: true })
    expect(parseCommand(['hq', 'console-code', '--no-machines', '--yes'])).toEqual({ kind: 'consoleCode', yes: true, noMachines: true })
    expect(parseCommand(['hq', 'console-code', '--machines'])).toMatchObject({ kind: 'usage' })
  })

  it('is refused without the confirmation: the host service makes nothing and keeps its pin', async () => {
    const r = await send({ op: 'hq.consoleCode', noMachines: true }, () => {})
    expect(r).toMatchObject({ ok: false, refusal: { code: 'conflict', message: expect.stringContaining('every machine must connect again') } })
    expect(await send({ op: 'hq.consoleCode', noMachines: true, confirmed: 'yes' }, () => {})).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
    answers = ['n']
    expect(await cli('hq', 'console-code', '--no-machines')).toBe(1)
    expect(flat(out)).toContain('every machine, hq-box too, must connect to it again with agenthix console connect <hq address> <code>')
    expect(m.calls.some(c => c[0] === 'exec' && c.includes('console-code'))).toBe(false)
    expect(readPin(m.ctx.state)).not.toBeNull()
  })

  it("makes HQ's own code once agreed, and leaves the lost Fleet Console so a new one can take this machine", async () => {
    answers = ['y']
    expect(await cli('hq', 'console-code', '--no-machines')).toBe(0)
    expect(out).toContain('  Code: 4HQW-N7TE-M9S3')
    expect(flat(out)).toContain('hq-box no longer answers the one before.')
    expect(readPin(m.ctx.state)).toBeNull()
    expect(stopped).toBe(1)
  })

  it('without the flag, still never falls back to a code with no machines', async () => {
    answers = ['y']
    expect(await cli('hq', 'console-code')).toBe(1)
    expect(m.calls.some(c => c[0] === 'exec' && c.includes('console-code'))).toBe(false)
    expect(readPin(m.ctx.state)).not.toBeNull()
  })

  it('is refused while the Fleet Console runs here, which every machine follows', async () => {
    m.up.add('agenthix-console')
    expect(await send({ op: 'hq.consoleCode', noMachines: true, confirmed: true }, () => {})).toMatchObject({ ok: false, refusal: { message: expect.stringContaining('The Fleet Console runs here') } })
  })
})
