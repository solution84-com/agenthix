import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../install'
import { readInstallation } from '../../state/installation'
import { ownerHandler } from '../../owner/dispatch'
import { parseCommand } from '../../cli/commands'

let m: FakeMachine
beforeEach(() => { m = fakeMachine() })
afterEach(() => m.cleanup())

const ask = (data: unknown) => ownerHandler(m.ctx)(data, () => {}) as Promise<Record<string, unknown>>
const consolePorts = () => (JSON.parse(fs.readFileSync(m.ctx.state.path('console', 'compose.json'), 'utf8')) as { services: { console: { ports: string[] } } }).services.console.ports
const consoleUps = () => m.calls.filter(c => c[0] === 'compose' && c.includes('up') && c.includes('agenthix-console'))

describe('console port @SC-1243', () => {
  it('is a command that takes one port', () => {
    expect(parseCommand(['console', 'port', '7900'])).toEqual({ kind: 'consolePort', port: 7900 })
    expect(parseCommand(['console', 'port'])).toMatchObject({ kind: 'usage' })
    expect(parseCommand(['console', 'port', 'seven'])).toMatchObject({ kind: 'usage' })
  })

  it('moves the Fleet Console to the port, records it and recreates its container on it', async () => {
    await install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
    m.calls.length = 0
    expect(await ask({ op: 'console.port', port: 7900 })).toEqual({
      ok: true, op: 'console.port', result: { machine: 'hq-box', address: 'http://127.0.0.1:7900', previous: 'http://127.0.0.1:7801' },
    })
    expect(readInstallation(m.ctx.state)?.ports).toEqual({ hq: 7800, console: 7900 })
    expect(consolePorts()).toEqual(['127.0.0.1:7900:4301'])
    expect(consoleUps()).toHaveLength(1)
  })

  it('is refused, changing nothing, when the port is held, HQ\'s own, out of range or the same', async () => {
    await install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
    m.calls.length = 0
    m.heldPorts.add(7900)
    expect(await ask({ op: 'console.port', port: 7900 })).toMatchObject({ ok: false, refusal: {
      code: 'conflict', message: 'Port 7900, for the Fleet Console, is held by a program on this machine, not by a container. Choose another port. Nothing was changed.',
    } })
    expect(await ask({ op: 'console.port', port: 7800 })).toMatchObject({ ok: false, refusal: {
      message: "Port 7800, for the Fleet Console, is HQ's own port in this installation. Choose another port. Nothing was changed.",
    } })
    expect(await ask({ op: 'console.port', port: 80 })).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
    expect(await ask({ op: 'console.port', port: 7801 })).toMatchObject({ ok: false, refusal: { message: 'The Fleet Console is already on port 7801. Nothing was changed.' } })
    expect(readInstallation(m.ctx.state)?.ports.console).toBe(7801)
    expect(consoleUps()).toEqual([])
  })

  it('is refused where no Fleet Console runs', async () => {
    expect(await ask({ op: 'console.port', port: 7900 })).toMatchObject({ ok: false, refusal: { code: 'not_installed', message: expect.stringMatching(/^No Fleet Console runs on hq-box/) } })
    expect(await ask({ op: 'console.port', port: 'x' })).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
  })
})
