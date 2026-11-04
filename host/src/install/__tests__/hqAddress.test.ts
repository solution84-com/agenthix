/**
 * `site hq-address` and `hq address` (host-management spec §13): a site is pointed only after the new address passes
 * the move check on its credential; HQ moving on its machine tells everyone first, stops, backs up, and starts at
 * the new address, or is put back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MOVE_CHECK_PATH } from '@agenthix/core'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { installed } from '../../service/context'
import { installSecrets } from '../../state/secrets'
import { recordAgentRange } from '../../state/installation'
import { pointSite } from '../siteAddress'
import { moveHqAddress } from '../hqAddress'
import { install } from '../install'
import { generateHostKeys, fingerprintOf } from '@agenthix/core/host-crypto'
import { readPin, writePin } from '../../link/pin'
import { hqStandIn, nothingAt, type HqStandIn } from '../../link/__tests__/moveCheckHq'

const flat = (text: string) => text.replace(/\s+/g, ' ')
const OLD = 'http://192.168.1.20:4100'
const CREDENTIAL = 'f'.repeat(64)

let m: FakeMachine
let stands: HqStandIn[]

beforeEach(() => {
  m = fakeMachine()
  stands = []
})
afterEach(async () => {
  await Promise.all(stands.map(s => s.close()))
  m.cleanup()
})

async function stand(credentials: string[]) {
  const s = await hqStandIn(credentials)
  stands.push(s)
  return s
}

function addedSite() {
  installSecrets(m.ctx.state)
  m.ctx.state.writeJson(['site', 'settings.json'], { name: 'office-server', version: '0.2.0', hqUrl: OLD, installedAt: 'x' })
  m.ctx.state.writeJson(['site', 'credential.json'], { credential: CREDENTIAL, madeAt: 'x' })
  // As the site's first install left it.
  recordAgentRange(m.ctx.state, '10.213.32.0/20')
}

const composeEnv = () => (m.ctx.state.readJson('site', 'compose.json') as { services: { site: { environment: Record<string, string> } } }).services.site.environment

describe('site hq-address @SC-856', () => {
  it('points the site once the new address passes the check, and starts it with that address', async () => {
    addedSite()
    const real = await stand([CREDENTIAL])
    const r = await pointSite(m.ctx, real.address, () => {})
    expect(r).toEqual({ siteName: 'office-server', address: real.address, previous: OLD })
    expect(installed(m.ctx).site?.settings.hqUrl).toBe(real.address)
    expect(composeEnv().HQ_URL).toBe(real.address)
    expect(composeEnv().AGENT_NETWORK_RANGE).toBe('10.213.32.0/20')
    expect(m.up.has('agenthix-site')).toBe(true)
  })

  it('refuses an address that fails the check, in words, sending it nothing more and changing nothing', async () => {
    addedSite()
    const stranger = await stand(['another site credential'])
    const err = await pointSite(m.ctx, stranger.address, () => {}).catch(e => e)
    expect(flat(err.message)).toBe(
      `Not changed: ${stranger.address} is an Agenthix HQ, but not the one this site belongs to: it could not prove it holds this site's credential. ` +
      `The site still uses ${OLD}. It learned nothing from this site and took nothing over. Check the address with a fleet admin; HQ's Settings page shows the address it has now.`,
    )
    expect(stranger.requests.map(q => q.path)).toEqual([MOVE_CHECK_PATH])
    expect(JSON.stringify(stranger.requests)).not.toContain(CREDENTIAL)
    expect(installed(m.ctx).site?.settings.hqUrl).toBe(OLD)
    expect(m.calls.some(c => c[0] === 'compose' && c.includes('up'))).toBe(false)

    const down = await nothingAt()
    expect(flat((await pointSite(m.ctx, down, () => {}).catch(e => e)).message)).toBe(`Not changed: nothing answers at ${down}. HQ may not have finished moving. Try again later.`)
  })

  it("refuses for HQ's own site, which has no address to set", async () => {
    await install(m.ctx, { address: 'http://localhost:4100' }, () => {})
    const err = await pointSite(m.ctx, 'http://192.168.1.30:4100', () => {}).catch(e => e)
    expect(err.message).toMatch(/^The site here is HQ's own/)
  })
})

describe('hq address @SC-855', () => {
  const NEW = 'http://192.168.1.30:4100'
  const told = { ok: true, text: 'told', data: { sites: { told: 2, online: 2, of: 3 }, hosts: { told: 1, of: 2 }, console: true } } as const

  async function installedHq() {
    await install(m.ctx, { address: 'http://localhost:4100' }, () => {})
    m.calls.length = 0
  }

  it('tells HQ first, stops it, takes a backup, and starts it at the new address', async () => {
    await installedHq()
    m.hq['address-move'] = told
    m.hq.status = { ok: true, text: 'HQ', data: { users: 1, hqSite: { state: 'connected', dockerRunning: true }, address: NEW, version: 'dev', commit: 'c' } }
    const steps: string[] = []
    const r = await moveHqAddress(m.ctx, NEW, p => { if (p.event === 'step') steps.push(p.step) })
    expect(r).toEqual({ address: NEW, previous: 'http://localhost:4100', told: { sites: { told: 2, of: 3 }, hosts: { told: 1, of: 2 }, console: true } })
    expect(steps).toEqual([
      "Telling HQ's sites and host services the new address", 'Stopping HQ and its site', 'Taking a sealed backup',
      `Starting HQ at ${NEW}`, 'HQ answers at its new address',
    ])
    const hq = installed(m.ctx).hq!.settings
    expect(hq).toMatchObject({ address: NEW, bind: '0.0.0.0' })
    // The port is recorded once, in installation.json, and not again in HQ's settings.
    expect(hq).not.toHaveProperty('port')
    expect(installed(m.ctx).hq!.port).toBe(4100)
    const tellAt = m.calls.findIndex(c => c.includes('address-move'))
    const stopAt = m.calls.findIndex(c => c[0] === 'compose' && c.includes('stop'))
    expect(tellAt).toBeGreaterThanOrEqual(0)
    expect(tellAt).toBeLessThan(stopAt)
  })

  it('puts HQ back at its old address when it does not answer at the new one, and tells those it told', async () => {
    await installedHq()
    m.hq['address-move'] = told
    const err = await moveHqAddress(m.ctx, NEW, () => {}).catch(e => e)
    expect(err.message).toMatch(/HQ is at http:\/\/localhost:4100 again, and those it told were told it stays\.$/)
    expect(installed(m.ctx).hq!.settings.address).toBe('http://localhost:4100')
    const moves = m.calls.filter(c => c.includes('address-move')).map(c => c[c.length - 1])
    expect(moves).toEqual([NEW, 'http://localhost:4100'])
  })

  it('is refused before HQ is told anything when the new address is on a port another holds @SC-1244', async () => {
    await installedHq()
    m.hq['address-move'] = told
    m.heldPorts.add(7500)
    const err = await moveHqAddress(m.ctx, 'http://192.168.1.30:7500', () => {}).catch(e => e)
    expect(err).toMatchObject({ code: 'conflict' })
    expect(err.message).toBe('Port 7500, for HQ, is held by a program on this machine, not by a container. Give HQ an address on another port. Nothing was changed.')
    expect(m.calls.some(c => c.includes('address-move'))).toBe(false)
    expect(installed(m.ctx).hq!.port).toBe(4100)
  })

  it('changes nothing when HQ does not answer to tell anyone, or the address is the same', async () => {
    await installedHq()
    m.hq['address-move'] = null
    expect((await moveHqAddress(m.ctx, NEW, () => {}).catch(e => e)).message).toMatch(/could tell no one its new address\. Nothing was changed\./)
    expect(m.calls.some(c => c[0] === 'compose' && c.includes('stop'))).toBe(false)
    expect((await moveHqAddress(m.ctx, 'http://localhost:4100', () => {}).catch(e => e)).code).toBe('conflict')
  })

  it('puts HQ back when starting it at the new address throws, and says so when even that does not start', async () => {
    await installedHq()
    m.hq['address-move'] = told
    const real = m.ctx.docker.composeUp.bind(m.ctx.docker)
    let failures = 1
    vi.spyOn(m.ctx.docker, 'composeUp').mockImplementation(async (project, file) => {
      if (failures-- > 0) throw new Error('port is already allocated')
      return real(project, file)
    })
    const err = await moveHqAddress(m.ctx, NEW, () => {}).catch(e => e)
    expect(err.message).toBe('HQ could not start at http://192.168.1.30:4100: port is already allocated. HQ is at http://localhost:4100 again, and those it told were told it stays.')
    expect(installed(m.ctx).hq!.settings.address).toBe('http://localhost:4100')
    expect(m.up.has('agenthix-hq')).toBe(true)
    expect(m.calls.filter(c => c.includes('address-move')).map(c => c[c.length - 1])).toEqual([NEW, 'http://localhost:4100'])

    failures = 2
    const worse = await moveHqAddress(m.ctx, NEW, () => {}).catch(e => e)
    expect(worse.message).toMatch(/is recorded again, but HQ did not start there: port is already allocated\./)
    expect(worse.message).not.toMatch(/HQ is at .* again/)
  })

  it("moves the pin of hq's own machine with hq's local port after a hand-over, though the pin is no longer marked local", async () => {
    await installedHq()
    m.hq['address-move'] = told
    const keys = await generateHostKeys('console')
    writePin(m.ctx.state, {
      console: keys.identity as never, consoleFingerprint: await fingerprintOf(keys.identity),
      hqAddress: 'http://127.0.0.1:4100', hostId: 'h1', machineCredential: CREDENTIAL, pinnedAt: '2026-10-14T09:00:00.000Z', local: false,
    })
    m.ctx.link = { start: () => {}, stop: () => {}, connected: () => false, sendEnvelope: () => false }
    m.hq.status = { ok: true, text: 'HQ', data: { users: 1, hqSite: { state: 'connected', dockerRunning: true }, address: 'http://192.168.1.30:4200', version: 'dev', commit: 'c' } }
    await moveHqAddress(m.ctx, 'http://192.168.1.30:4200', () => {})
    expect(readPin(m.ctx.state)?.hqAddress).toBe('http://127.0.0.1:4200')
  })
})
