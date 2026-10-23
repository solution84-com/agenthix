/**
 * The ports an install publishes (one port plan, Rule 3) and the labels every container it runs carries (Rule 5):
 * chosen once by the machine admin, refused before anything is fetched or written when they cannot be, recorded in
 * installation.json and read back after.
 */
import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install, type InstallAsk } from '../install'
import { installConsoleElsewhere } from '../console'
import { readInstallation } from '../../state/installation'
import { ownerHandler } from '../../owner/dispatch'
import { frontDoorCompose } from '../../frontDoor/config'

let m: FakeMachine
beforeEach(() => { m = fakeMachine() })
afterEach(() => m.cleanup())

const run = (ask: Partial<InstallAsk> = {}) => install(m.ctx, { address: 'https://hq.acme.example', ...ask }, () => {})
const compose = (part: 'hq' | 'site' | 'console') => JSON.parse(fs.readFileSync(m.ctx.state.path(part, 'compose.json'), 'utf8'))
const nothingDone = () => {
  expect(m.calls.filter(c => c[0] === 'pull' || (c[0] === 'compose' && c.includes('up')))).toEqual([])
  expect(fs.existsSync(m.ctx.state.path('hq', 'settings.json'))).toBe(false)
  expect(readInstallation(m.ctx.state)?.ports).toEqual({ hq: null, console: null })
}

describe('the ports an install publishes @SC-1242', () => {
  it('publishes HQ on 7800 and the Fleet Console on 7801 by default, and records both', async () => {
    await run()
    expect(compose('hq').services['hq-web'].ports).toEqual(['127.0.0.1:7800:4100'])
    expect(compose('console').services.console.ports).toEqual(['127.0.0.1:7801:4301'])
    expect(compose('console').services.console.environment).toMatchObject({ CONSOLE_PORT: '4301', CONSOLE_PUBLISHED_PORT: '7801' })
    expect(readInstallation(m.ctx.state)?.ports).toEqual({ hq: 7800, console: 7801 })
    expect(m.ctx.state.readJson('hq', 'settings.json')).not.toHaveProperty('port')
  })

  it("takes HQ's port from a plain-http address, and the console's from --console-port", async () => {
    const r = await run({ address: 'http://192.168.0.13:7500', consolePort: 7520 })
    expect(r.listen).toEqual({ bind: '0.0.0.0', port: 7500 })
    expect(compose('hq').services['hq-web'].ports).toEqual(['0.0.0.0:7500:4100'])
    expect(compose('console').services.console.ports).toEqual(['127.0.0.1:7520:4301'])
    expect(readInstallation(m.ctx.state)?.ports).toEqual({ hq: 7500, console: 7520 })
  })

  it('publishes an https address on 127.0.0.1 at --hq-port', async () => {
    await run({ hqPort: 7600 })
    expect(compose('hq').services['hq-web'].ports).toEqual(['127.0.0.1:7600:4100'])
  })

  it('refuses an address and --hq-port that disagree, before anything is fetched or written', async () => {
    const err = await run({ address: 'http://192.168.0.13:7500', hqPort: 7600 }).catch(e => e)
    expect(err.message).toBe("HQ's address is on port 7500, but --hq-port says 7600. Give one of them. Nothing was changed.")
    nothingDone()
  })

  it('refuses a port outside 1024–32767, before anything is fetched or written', async () => {
    const err = await run({ consolePort: 50000 }).catch(e => e)
    expect(err.message).toMatch(/^Port 50000 is in the range the operating system gives to outgoing connections/)
    nothingDone()
  })

  it('keeps the ports on a re-run, and refuses one that asks for another', async () => {
    await run({ consolePort: 7520 })
    await run()
    expect(readInstallation(m.ctx.state)?.ports).toEqual({ hq: 7800, console: 7520 })
    const err = await run({ consolePort: 7530 }).catch(e => e)
    expect(err.message).toBe('The Fleet Console is already published here on port 7520, not 7530. To move it: agenthix console port. Nothing was changed.')
  })

  it('takes the ports from the command line through the owner socket', async () => {
    const answer = await ownerHandler(m.ctx)({ op: 'machine.install', address: 'https://hq.acme.example', hqPort: 7650, consolePort: 7651 }, () => {})
    expect(answer).toMatchObject({ ok: true })
    expect(readInstallation(m.ctx.state)?.ports).toEqual({ hq: 7650, console: 7651 })
    expect(await ownerHandler(m.ctx)({ op: 'machine.install', address: 'https://hq.acme.example', hqPort: '7650' }, () => {}))
      .toMatchObject({ ok: false, refusal: { code: 'malformed' } })
  })
})

describe('the labels every container carries @SC-1248', () => {
  it("carries the installation's published ports on each container it runs", async () => {
    await run({ address: 'http://192.168.0.13:7500', consolePort: 7520 })
    const services = [...Object.values(compose('hq').services), ...Object.values(compose('site').services), ...Object.values(compose('console').services)]
    expect(services).toHaveLength(6)
    for (const s of services as { labels: Record<string, string> }[]) {
      expect(s.labels['agenthix.ports']).toBe('7500,7520')
      expect(s.labels['agenthix.agent-range']).toBe('10.213.0.0/20')
    }
    const door = frontDoorCompose(m.ctx.names, { state: '/srv' }, '', { ...readInstallation(m.ctx.state)!, agentRange: '10.213.16.0/20' })
    expect(door.services['front-door'].labels).toMatchObject({ 'agenthix.ports': '7500,7520', 'agenthix.agent-range': '10.213.16.0/20' })
  })
})

describe('console install elsewhere @SC-1242', () => {
  it('publishes on --console-port, and records it', async () => {
    m.consoleAnswers['handover-status'] = { state: 'connected' }
    const r = await installConsoleElsewhere(m.ctx, 'https://hq.acme.example', '4HQWN7TEM9S3', () => {}, 7700)
    expect(r.address).toBe('http://127.0.0.1:7700')
    expect(compose('console').services.console.ports).toEqual(['127.0.0.1:7700:4301'])
    expect(compose('console').services.console.labels['agenthix.ports']).toBe('7700')
    expect(readInstallation(m.ctx.state)?.ports).toEqual({ hq: null, console: 7700 })
  })

  it('is refused before anything is fetched when its port is held, naming the holder', async () => {
    m.heldPorts.add(7801)
    await expect(installConsoleElsewhere(m.ctx, 'https://hq.acme.example', '4HQWN7TEM9S3', () => {})).rejects.toThrow(
      'Port 7801, for the Fleet Console, is held by a program on this machine, not by a container. Choose another with --console-port. Nothing was changed.')
    expect(m.calls.filter(c => c[0] === 'pull' || c[0] === 'compose')).toEqual([])
    expect(m.checked).toEqual([])
    expect(readInstallation(m.ctx.state)?.ports.console).toBeNull()
  })

  it('refuses a port outside the range before anything is fetched', async () => {
    await expect(installConsoleElsewhere(m.ctx, 'https://hq.acme.example', '4HQWN7TEM9S3', () => {}, 80)).rejects.toThrow(/Port 80 needs extra privileges/)
    expect(m.calls.filter(c => c[0] === 'pull')).toEqual([])
  })
})
