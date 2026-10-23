import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { digestOf, fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import type { Progress } from '../../sockets/lineServer'
import { install } from '../install'
import { Refusal } from '../../owner/results'
import { readPin } from '../../link/pin'
import { FakeConsole, FakeRelay } from '../../link/__tests__/fakeRelay'

let m: FakeMachine
beforeEach(() => { m = fakeMachine() })
afterEach(() => m.cleanup())

const progress: Progress[] = []
const run = (address = 'https://hq.acme.example') => install(m.ctx, { address: address }, p => progress.push(p))
const composeCalls = () => m.calls.filter(c => c[0] === 'compose' && c.includes('up')).map(c => c[c.indexOf('-p') + 1])

describe('install', () => {
  it("goes ahead beside another installation's HQ, which publishes other ports", async () => {
    m.machineContainers.push({
      name: 'other-hq-web', labels: { 'other.managed-by': 'host', 'other.role': 'hq', 'other.ports': '7500,7520' },
      running: true, published: [{ ip: '0.0.0.0', port: 7500 }],
    })
    await expect(run()).resolves.toMatchObject({ address: 'https://hq.acme.example' })
  })

  it("is refused, changing nothing, naming each port another installation or a program holds", async () => {
    m.machineContainers.push({ name: 'other-hq-web', labels: { 'other.managed-by': 'host', 'other.ports': '7800' }, running: false, published: [] })
    m.heldPorts.add(7801)
    const refused = await run().catch((e: unknown) => e)
    expect(refused).toBeInstanceOf(Refusal)
    expect(refused).toMatchObject({ code: 'conflict' })
    expect((refused as Refusal).message).toBe(
      'Port 7800, for HQ, is held by another installation on this machine, other (its container other-hq-web). Choose another with --hq-port. ' +
      'Port 7801, for the Fleet Console, is held by a program on this machine, not by a container. Choose another with --console-port. ' +
      'Nothing was changed.',
    )
    expect(m.calls.filter(c => c[0] === 'pull' || c[0] === 'compose')).toEqual([])
    expect(m.checked).toEqual([])
    expect(fs.existsSync(m.ctx.state.path('hq', 'settings.json'))).toBe(false)
  })

  it('starts hq, then its default site, connected by one pairing secret, and makes the first account’s link @SC-816', async () => {
    const result = await run()
    expect(composeCalls()).toEqual(['agenthix-hq', 'agenthix-site', 'agenthix-console'])
    expect(result).toMatchObject({
      address: 'https://hq.acme.example', siteName: 'hq-box', siteConnected: true, users: 0,
      firstAccountLink: 'https://hq.acme.example/setup?token=abc',
    })
    const hq = JSON.parse(fs.readFileSync(m.ctx.state.path('hq', 'compose.json'), 'utf8'))
    const site = JSON.parse(fs.readFileSync(m.ctx.state.path('site', 'compose.json'), 'utf8'))
    expect(hq.services['hq-server'].environment.HQ_PAIRING_SECRET).toHaveLength(64)
    expect(site.services.site.environment.HQ_PAIRING_SECRET).toBe(hq.services['hq-server'].environment.HQ_PAIRING_SECRET)
    expect(site.services.site.environment.SITE_ROOT).toBe('/home/sam/.agenthix/site/data')
  })

  it('keeps every setting and secret readable by its owner only, and prints none @SC-818', async () => {
    await run()
    for (const f of [['secrets.json'], ['hq', 'compose.json'], ['site', 'compose.json'], ['hq', 'settings.json'], ['console', 'compose.json']]) {
      expect(fs.statSync(m.ctx.state.path(...f)).mode & 0o777).toBe(0o600)
    }
    const secrets = JSON.parse(fs.readFileSync(m.ctx.state.path('secrets.json'), 'utf8')) as Record<string, string>
    const said = JSON.stringify(progress) + JSON.stringify(m.calls)
    for (const value of Object.values(secrets)) expect(said).not.toContain(value)
  })

  it('serves an https address through the machine’s own front door, on 127.0.0.1:7800 @SC-819', async () => {
    expect((await run()).listen).toEqual({ bind: '127.0.0.1', port: 7800 })
  })

  it('takes the first account’s link from HQ’s data, not from its words @SC-818', async () => {
    m.hq['invite-admin'] = { ok: true, text: 'Open the setup page.', data: { kind: 'first_admin', link: 'https://hq.acme.example/setup?token=data', validHours: 24 } }
    expect((await run()).firstAccountLink).toBe('https://hq.acme.example/setup?token=data')
  })

  it('changes nothing that is set when run again, and makes no second link once HQ has people @SC-818', async () => {
    await run()
    const before = fs.readFileSync(m.ctx.state.path('secrets.json'), 'utf8')
    m.hq.status = { ...m.hq.status!, ...{ data: { ...(m.hq.status as { data: object }).data, users: 2 } } } as never
    const again = await run()
    expect(fs.readFileSync(m.ctx.state.path('secrets.json'), 'utf8')).toBe(before)
    expect(again.firstAccountLink).toBeNull()
    expect(again.users).toBe(2)
  })

  it('refuses another address once HQ is installed, changing nothing @SC-817', async () => {
    await run()
    await expect(run('https://other.example')).rejects.toMatchObject({ code: 'already_installed' })
  })

  it('refuses an address a browser cannot use, before touching Docker @SC-817', async () => {
    await expect(run('hq.acme.example')).rejects.toBeInstanceOf(Refusal)
    await expect(run('https://hq.acme.example/')).rejects.toMatchObject({ code: 'malformed' })
    expect(m.calls).toEqual([])
  })

  it('says which image it could not get @SC-817', async () => {
    m.missingImages.add(`ghcr.io/solution84-com/agenthix-hq-server@${digestOf('ghcr.io/solution84-com/agenthix-hq-server:0.2.0')}`)
    await expect(run()).rejects.toThrow(/agenthix-hq-server@sha256:[0-9a-f]{64} could not be fetched/)
  })

  it('names the next step when HQ does not answer @SC-817', async () => {
    m.hq.status = null
    await expect(run()).rejects.toThrow(/agenthix hq logs/)
  })

  it('finishes, saying so, when the site has not connected yet @SC-817', async () => {
    m.hq.status = { ok: true, text: '', data: { users: 0, hqSite: { state: 'notConnected', dockerRunning: true }, address: 'x', version: 'dev', commit: 'c' } }
    expect((await run()).siteConnected).toBe(false)
    expect(progress).toContainEqual({ event: 'stepDone', outcome: 'not connected yet' })
  })

  it('refuses before fetching or writing anything when no address range is left for its networks @SC-1158', async () => {
    m.dockerNetworks.push({ name: 'greedy', subnets: ['10.214.0.0/16'] })
    const refused = await run().catch((e: unknown) => e)
    expect(refused).toBeInstanceOf(Refusal)
    expect(refused).toMatchObject({ code: 'failed' })
    expect((refused as Refusal).message).toMatch(/^No address range is left for the network agenthix-console: .*10\.214\.0\.0\/16.*docker network rm/)
    expect(m.calls.filter(c => c[0] === 'pull')).toEqual([])
    expect(composeCalls()).toEqual([])
    expect(fs.existsSync(m.ctx.state.path('hq', 'settings.json'))).toBe(false)
  })

  it('gives each network it writes the /24 it chose, skipping one another Docker network has @SC-1158', async () => {
    m.dockerNetworks.push({ name: 'other', subnets: ['10.214.0.0/24'] })
    await run()
    const subnet = (part: string, key: string) =>
      JSON.parse(fs.readFileSync(m.ctx.state.path(part, 'compose.json'), 'utf8')).networks[key].ipam?.config[0].subnet
    expect(subnet('console', 'console')).toBe('10.214.1.0/24')
    expect(subnet('hq', 'internal')).toBe('10.214.2.0/24')
    expect(subnet('site', 'internal')).toBe('10.214.3.0/24')
    expect(subnet('hq', 'edge')).toBe('10.214.4.0/24')
    expect(subnet('hq', 'link')).toBe('10.214.5.0/24')
    expect(subnet('site', 'link')).toBeUndefined()
  })
})

describe('install without the figures volume', () => {
  it('refuses before touching Docker, naming the line to add @SC-817', async () => {
    m.ctx.figuresWarning = 'The volume agenthix-host-figures is not mounted at /run/host-figures … -v agenthix-host-figures:/run/host-figures'
    await expect(run()).rejects.toThrow(/-v agenthix-host-figures:\/run\/host-figures/)
    expect(m.calls).toEqual([])
  })
})

describe('the Fleet Console on HQ’s machine', () => {
  const consoleCompose = () => JSON.parse(fs.readFileSync(m.ctx.state.path('console', 'compose.json'), 'utf8'))

  it('starts beside HQ, published on the machine’s own 127.0.0.1:7801 only, admitted by one pairing secret set in both @SC-816', async () => {
    await run()
    const hq = JSON.parse(fs.readFileSync(m.ctx.state.path('hq', 'compose.json'), 'utf8'))
    const fleetConsole = consoleCompose().services.console
    expect(fleetConsole.network_mode).toBeUndefined()
    expect(fleetConsole.ports).toEqual(['127.0.0.1:7801:4301'])
    expect(fleetConsole.environment.CONSOLE_LISTEN_HOST).toBe('container')
    // Its own network, and HQ's link network to reach hq-web by name, as HQ's default site does.
    expect(fleetConsole.networks).toEqual(['console', 'link'])
    expect(consoleCompose().networks).toMatchObject({ console: { name: 'agenthix-console' }, link: { name: 'agenthix-hq-link', external: true } })
    // A named volume, never a bind mount: the Fleet Console's control socket lives there, and a Unix socket cannot
    // be made in a folder bind-mounted from Docker Desktop.
    expect(fleetConsole.volumes).toEqual(['state:/state'])
    expect(consoleCompose().volumes).toEqual({ state: { name: 'agenthix-console-state' } })
    expect(fleetConsole.environment).toMatchObject({ CONSOLE_STATE_DIR: '/state', CONSOLE_HQ_ADDRESS: 'http://agenthix-hq-web:4100', CONSOLE_MACHINE_NAME: 'hq-box' })
    expect(fleetConsole.environment.CONSOLE_HQ_CODE).toBeUndefined()
    expect(fleetConsole.environment.HQ_CONSOLE_PAIRING_SECRET).toHaveLength(64)
    expect(hq.services['hq-server'].environment.HQ_CONSOLE_PAIRING_SECRET).toBe(fleetConsole.environment.HQ_CONSOLE_PAIRING_SECRET)
    expect(JSON.stringify(fleetConsole)).not.toContain('docker.sock')
  })

  it('connects this machine to it with a code from its own command line, pinning it only once it proves it holds that code', async () => {
    const relay = new FakeRelay()
    const fleetConsole = await FakeConsole.make()
    m.ctx.dial = relay.dial
    m.consoleLocalJoin.code = '9TR2-WW4C-D25V'
    relay.onJoin = async (join, conn) => {
      const code = '9TR2WW4CD25V'
      await conn.deliver('host.joined', { hostId: 'hq-host', machineCredential: 'hmc_localmachine0123', acceptance: await fleetConsole.acceptance(code, join.identity) })
    }
    await run()
    expect(relay.last.url).toBe('ws://127.0.0.1:7800/host-link')
    expect(readPin(m.ctx.state)).toMatchObject({ consoleFingerprint: fleetConsole.fingerprint, local: true, hqAddress: 'http://127.0.0.1:7800' })
    expect(progress).toContainEqual({ event: 'stepDone', outcome: 'connected' })
    expect(m.calls).toContainEqual(['exec', '-i', 'agenthix-console', 'node', '/app/dist/cli.js', 'local-join'])
    expect(JSON.stringify(relay.connections)).not.toContain('9TR2WW4CD25V')
  })

  it('pins nothing when the answer does not prove the code, and says it keeps trying', async () => {
    const relay = new FakeRelay()
    const impostor = await FakeConsole.make()
    m.ctx.dial = relay.dial
    m.consoleLocalJoin.code = '9TR2-WW4C-D25V'
    relay.onJoin = async (join, conn) => {
      await conn.deliver('host.joined', { hostId: 'hq-host', machineCredential: 'hmc_localmachine0123', acceptance: await impostor.acceptance('ZZZZZZZZZZZZ', join.identity) })
    }
    await run()
    expect(readPin(m.ctx.state)).toBeNull()
    expect(progress).toContainEqual({ event: 'stepDone', outcome: 'not yet; it keeps trying' })
  })
})
