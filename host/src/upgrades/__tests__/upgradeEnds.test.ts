import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { digestOf, fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { installed } from '../../service/context'
import { scheduleChange, tickScheduled } from '../../scheduled/scheduler'
import { readStore } from '../../scheduled/store'
import type { HqStatusData } from '../../hq/control'
import { upgrade } from '../upgrade'
import { readUpgrades } from '../settings'
import { upgradesStatus } from '../status'
import { statusText } from '../../cli/statusText'
import { scheduledText } from '../../cli/scheduled'
import { EndedPartway } from '../../scheduled/endedPartway'
import '../operations'

const REGISTRY = 'ghcr.io/solution84-com'
const tagged = (part: string, v: string) => `${REGISTRY}/agenthix-${part}:${v}`
const pinned = (part: string, v: string) => `${REGISTRY}/agenthix-${part}@${digestOf(tagged(part, v))}`
const MIN = 60_000

let m: FakeMachine
let log: string[]

function hqAnswers(version: string | null): void {
  const data = (m.hq.status as unknown as { data: HqStatusData } | null)?.data
  m.hq.status = version === null || !data ? null : { ok: true, text: 'HQ', data: { ...data, version } }
}

const composeOf = (target: 'hq' | 'site') => fs.readFileSync(m.ctx.state.path(target, 'compose.json'), 'utf8')

/** Compose refusing to bring up any project that runs `version`, in Docker's own words. */
function composeRefuses(version: string): void {
  const up = m.ctx.docker.composeUp.bind(m.ctx.docker)
  m.ctx.docker.composeUp = async (project, file) => {
    const text = fs.readFileSync(file, 'utf8')
    if (text.includes(pinned('hq-server', version)) || text.includes(pinned('site-server', version))) {
      throw new Error(`docker compose -p ${project} failed: network agenthix-hq-link declared as external, but could not be found.`)
    }
    return up(project, file)
  }
}

beforeEach(async () => {
  m = fakeMachine()
  log = []
  m.ctx.log = line => log.push(line)
  await install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
  m.hq['scheduled-change'] = { ok: true, text: 'Taken.' }
  m.calls.length = 0
})
afterEach(() => m.cleanup())

describe('an upgrade whose new version could not be started', () => {
  it('keeps compose’s words as the reason, runs no health check, and goes straight to the put-back', async () => {
    composeRefuses('0.2.1')
    let asked = 0
    const status = m.ctx.hqControl.status.bind(m.ctx.hqControl)
    m.ctx.hqControl.status = async () => { asked++; return status() }
    const steps: string[] = []
    const outcome = await upgrade(m.ctx, 'hq', '0.2.1', p => { if (p.event === 'step') steps.push(p.step) })
    expect(steps).not.toContain('Health check')
    expect(steps).toContain('Going back to 0.2.0')
    expect(asked).toBe(0)
    expect(outcome.rolledBack && outcome.reason).toMatch(/^HQ could not be started on 0\.2\.1: docker compose -p agenthix-hq failed: network agenthix-hq-link declared as external, but could not be found\. The host service restored the backup/)
    expect(readUpgrades(m.ctx.state).last?.reason).toContain('declared as external, but could not be found')
    expect(log).toContain('Upgrade of HQ to 0.2.1: Starting 0.2.1: fails: docker compose -p agenthix-hq failed: network agenthix-hq-link declared as external, but could not be found.')
    expect(log.some(l => l.startsWith('Upgrade of HQ to 0.2.1: rolled back. HQ could not be started on 0.2.1'))).toBe(true)
    expect(installed(m.ctx).hq!.settings.version).toBe('0.2.0')
  })
})

describe('an upgrade checked against what it started', () => {
  it('fails its health check when the site still runs the old version, even with HQ answering as the new one', async () => {
    hqAnswers('0.2.1')
    m.containerEnvs.set('agenthix-site-server', ['APP_VERSION=0.2.0'])
    const outcome = await upgrade(m.ctx, 'hq', '0.2.1', () => {})
    expect(outcome.rolledBack && outcome.reason).toContain('the site hq-box did not start as 0.2.1 within 1 minute')
  })
})

describe('an upgrade whose health check fails and whose put-back fails too', () => {
  const failPutBack = () => {
    m.ctx.backupIO.restoreDatabase = async () => { throw new Error('the database would not take the rows') }
  }

  it('by hand: is logged with both reasons, keeps what is under way, and leaves the databases running', async () => {
    hqAnswers(null)
    failPutBack()
    const err = await upgrade(m.ctx, 'hq', '0.2.1', () => {}).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(EndedPartway)
    const words = (err as Error).message
    expect(words).toMatch(/^HQ did not pass its health check: hq-server did not answer within 1 minute\. Putting it back failed too: the database would not take the rows\. The backup from \d\d:\d\d is on this machine, and HQ's and its site's databases are left running\./)
    expect(words).toContain('to try again now: agenthix hq upgrade 0.2.1')
    expect(log).toContain('Upgrade of HQ to 0.2.1: Health check: fails: hq-server did not answer within 1 minute.')
    expect(log).toContain('Upgrade of HQ to 0.2.1: Going back to 0.2.0: failed: the database would not take the rows.')
    expect(log).toContain(`Upgrade of HQ to 0.2.1: ended part-way. ${words}`)
    const s = readUpgrades(m.ctx.state)
    expect(s.underWay).toMatchObject({ to: '0.2.1', from: '0.2.0', problem: words })
    const started = m.backups.started
    expect(started.slice(-2)).toEqual(['agenthix-hq:hq-db', 'agenthix-site:site-db'])
  })

  it('scheduled: ends the change, and status and scheduled say the upgrade is part-way and what to run', async () => {
    await scheduleChange(m.ctx, { op: 'upgrade', target: 'hq', version: '0.2.1' }, new Date(m.ctx.now().getTime() + 60 * MIN).toISOString(), { kind: 'machineAdmin' })
    hqAnswers(null)
    failPutBack()
    await m.ctx.sleep(60 * MIN)
    await tickScheduled(m.ctx)
    expect(readStore(m.ctx.state).entries[0].notice?.reason).toContain('Putting it back failed too: the database would not take the rows')
    expect(log.some(l => l.startsWith('Upgrade of HQ to 0.2.1: ended part-way. HQ did not pass its health check'))).toBe(true)

    const partway = upgradesStatus(m.ctx).partway
    expect(partway).toMatchObject({ target: 'hq', to: '0.2.1', from: '0.2.0', stage: 'underWay' })
    m.up.delete('agenthix-hq')
    m.up.delete('agenthix-site')
    const text = statusText({
      machine: { name: 'hq-box', hostServiceVersion: '0.2.0' },
      hq: { address: 'https://hq.acme.example', version: '0.2.0', listen: { bind: '127.0.0.1', port: 7800 }, containers: 'stopped', answer: null },
      site: { name: 'hq-box', version: '0.2.0', containers: 'stopped', connection: 'unknown', carriesHq: true, cause: null },
      upgrades: upgradesStatus(m.ctx),
    } as Parameters<typeof statusText>[0], m.ctx.now()).replace(/\s+/g, ' ')
    expect(text).toContain('Stopped for an upgrade, which has not ended:')
    expect(text).toContain('The upgrade to 0.2.1, from 0.2.0, ended part-way. HQ did not pass its health check')
    expect(text).toContain('agenthix hq upgrade 0.2.1')
    expect(text).toContain("Stopped for HQ's upgrade, above.")
    expect(text).not.toContain('To start it again: agenthix install')

    const listed = scheduledText([], 'hq-box', m.ctx.now(), partway).replace(/\s+/g, ' ')
    expect(listed).toContain('The upgrade to 0.2.1, from 0.2.0, ended part-way.')
    expect(listed).toContain('Nothing else is scheduled on hq-box.')
  })
})

describe('an upgrade that cannot write what it would start, or go back to', () => {
  it('is refused before anything is checked, stops or is backed up, when the installation record lacks HQ’s port', async () => {
    const file = m.ctx.state.path('installation.json')
    const record = JSON.parse(fs.readFileSync(file, 'utf8')) as { ports: { hq: number | null } }
    record.ports.hq = null
    fs.writeFileSync(file, JSON.stringify(record))
    m.checked.length = 0
    await expect(upgrade(m.ctx, 'hq', '0.2.1', () => {})).rejects.toThrow(
      "Not upgraded: this installation's record (installation.json) does not hold HQ's published port, which the host service needs to write HQ's and its site's services. It was installed by an older host service. To record it, run install again, which changes nothing that is set: agenthix install --address https://hq.acme.example Then upgrade. Nothing was changed.")
    expect(m.calls.filter(c => c[0] === 'compose' || c[0] === 'pull')).toEqual([])
    expect(m.checked).toEqual([])
    expect(readUpgrades(m.ctx.state)).toMatchObject({ stopping: null, underWay: null })
  })
})

describe("the new version's compose projects", () => {
  it('need nothing outside them but what HQ’s own project makes and the host service’s figures volume', async () => {
    hqAnswers('0.2.1')
    await upgrade(m.ctx, 'hq', '0.2.1', () => {})
    type Project = { networks?: Record<string, { name: string; external?: boolean }>; volumes?: Record<string, { name: string; external?: boolean }> }
    const hq = JSON.parse(composeOf('hq')) as Project
    const site = JSON.parse(composeOf('site')) as Project
    const made = Object.values(hq.networks ?? {}).filter(n => !n.external).map(n => n.name)
    const external = [...Object.values(site.networks ?? {}), ...Object.values(hq.networks ?? {})].filter(n => n.external).map(n => n.name)
    expect(external.every(n => made.includes(n))).toBe(true)
    const externalVolumes = [...Object.values(site.volumes ?? {}), ...Object.values(hq.volumes ?? {})].filter(v => v.external).map(v => v.name)
    expect(externalVolumes).toEqual([m.ctx.names.hostFiguresVolume])
  })
})

describe('a version published before the relay', () => {
  it('is installed without a relay image, and an upgrade from it that fails is put back without one', async () => {
    m.cleanup()
    m = fakeMachine()
    m.ctx.machine.hostServiceVersion = '0.1.0-alpha.3'
    await install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
    expect(m.checked.map(c => c[0])).not.toContain(tagged('relay', '0.1.0-alpha.3'))
    expect(JSON.parse(composeOf('hq')).services).not.toHaveProperty('relay')

    m.ctx.machine.hostServiceVersion = '0.1.0-alpha.4'
    m.hq['scheduled-change'] = { ok: true, text: 'Taken.' }
    hqAnswers(null)
    const outcome = await upgrade(m.ctx, 'hq', '0.1.0-alpha.4', () => {})
    expect(outcome).toMatchObject({ version: '0.1.0-alpha.3', rolledBack: true })
    expect(m.checked.map(c => c[0])).toContain(tagged('relay', '0.1.0-alpha.4'))
    const back = JSON.parse(composeOf('hq')) as { services: Record<string, { image: string }> }
    expect(Object.keys(back.services)).toEqual(['hq-db', 'hq-server', 'hq-web'])
    expect(back.services['hq-server'].image).toBe(pinned('hq-server', '0.1.0-alpha.3'))
    expect(m.up.has('agenthix-hq') && m.up.has('agenthix-site')).toBe(true)
  })
})
