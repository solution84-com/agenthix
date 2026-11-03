import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ScheduledChangeNotice } from '@agenthix/core'
import { digestOf, fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { installed } from '../../service/context'
import { BackupStore } from '../../backups/store'
import { takeBackup } from '../../backups/take'
import { listScheduled, scheduleChange, tickScheduled } from '../../scheduled/scheduler'
import { readStore } from '../../scheduled/store'
import type { HqStatusData } from '../../hq/control'
import { finishUnderWay, upgrade } from '../upgrade'
import { readUpgrades, writeUpgrades } from '../settings'
import '../operations'

const REGISTRY = 'ghcr.io/solution84-com'
const tagged = (part: string, v: string) => `${REGISTRY}/agenthix-${part}:${v}`
const pinned = (part: string, v: string) => `${REGISTRY}/agenthix-${part}@${digestOf(tagged(part, v))}`

let m: FakeMachine
let hqStatus: HqStatusData

/** hq answering as `version`, or not at all. */
function hqAnswers(version: string | null): void {
  if (version === null) {
    m.hq.status = null
    return
  }
  hqStatus = { ...hqStatus, version }
  m.hq.status = { ok: true, text: 'HQ', data: hqStatus }
}

const composeOf = (target: 'hq' | 'site') => fs.readFileSync(m.ctx.state.path(target, 'compose.json'), 'utf8')
const actions = () => m.calls.filter(c => c[0] === 'compose' || c[0] === 'pull').map(c => (c[0] === 'pull' ? 'pull' : c.includes('stop') ? 'stop' : c.includes('up') ? 'up' : 'compose'))

beforeEach(async () => {
  m = fakeMachine()
  await install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
  hqStatus = (m.hq.status as unknown as { data: HqStatusData }).data
  m.hq['scheduled-change'] = { ok: true, text: 'Taken.' }
  m.calls.length = 0
  m.checked.length = 0
})
afterEach(() => m.cleanup())

describe('an upgrade of HQ and its site @SC-835', () => {
  it('refuses an unsigned new image before anything stops, is fetched or is backed up', async () => {
    m.signatures.set(tagged('hq-web', '0.2.1'), { kind: 'unsigned' })
    await expect(upgrade(m.ctx, 'hq', '0.2.1', () => {})).rejects.toThrow('carries no signature')
    expect(actions()).toEqual([])
    expect(installed(m.ctx).hq!.settings.version).toBe('0.2.0')
    expect(composeOf('hq')).toContain(pinned('hq-server', '0.2.0'))
    expect(await new BackupStore(m.ctx.state).list()).toEqual([])
    expect(readUpgrades(m.ctx.state).underWay).toBeNull()
  })

  it("is refused before anything is fetched or stops when another program took HQ's port @SC-1244", async () => {
    m.heldPorts.add(7800)
    m.up.delete('agenthix-hq')
    await expect(upgrade(m.ctx, 'hq', '0.2.1', () => {})).rejects.toThrow(
      'Port 7800, for HQ, is held by a program on this machine, not by a container. Free it, or move HQ with agenthix hq address <address>. Nothing was changed.')
    expect(actions()).toEqual([])
    expect(m.checked).toEqual([])
  })

  it('checks, fetches, stops, backs up, then switches to the new pinned images and checks they are healthy', async () => {
    hqAnswers('0.2.1')
    const steps: string[] = []
    const outcome = await upgrade(m.ctx, 'hq', '0.2.1', p => { if (p.event === 'step') steps.push(p.step) })
    expect(outcome).toEqual({ version: '0.2.1', rolledBack: false })
    expect(steps).toEqual([
      'Checking the images are signed by Agenthix', 'Pulling HQ 0.2.1 and its site', 'Stopping HQ and its site',
      'Taking a sealed backup', 'Starting 0.2.1', 'Health check',
    ])
    expect(m.checked.map(c => c[0])).toEqual(['hq-server', 'hq-web', 'relay', 'site-server', 'agent'].map(p => tagged(p, '0.2.1')))
    const order = actions()
    expect(order.indexOf('stop')).toBeGreaterThan(order.lastIndexOf('pull'))
    const here = installed(m.ctx)
    expect(here.hq!.settings).toMatchObject({ version: '0.2.1', images: { 'hq-server': pinned('hq-server', '0.2.1'), 'hq-web': pinned('hq-web', '0.2.1') } })
    expect(here.site!.settings).toMatchObject({ version: '0.2.1', images: { 'site-server': pinned('site-server', '0.2.1'), agent: pinned('agent', '0.2.1') } })
    expect(composeOf('site')).toContain(pinned('agent', '0.2.1'))
    const backups = await new BackupStore(m.ctx.state).list()
    expect(backups).toHaveLength(1)
    expect(backups[0].header.version).toBe('0.2.0')
    expect(backups[0].header.kind).toBe('beforeUpgrade')
    expect(backups[0].name).toMatch(/-upgrade-[0-9a-f]{8}\.sealed$/)
    expect(readUpgrades(m.ctx.state).underWay).toBeNull()
  })

  it("leaves the agents running: they are a group of their own, which the site's project and its orphans never include @SC-1156", async () => {
    m.agentContainers.push('agenthix-agent-1')
    hqAnswers('0.2.1')
    expect(await upgrade(m.ctx, 'hq', '0.2.1', () => {})).toEqual({ version: '0.2.1', rolledBack: false })
    expect(m.agentContainers).toEqual(['agenthix-agent-1'])
    expect(m.calls.filter(c => c[0] === 'rm' || c.includes('label=com.docker.compose.project=agenthix-agents'))).toEqual([])
    const site = JSON.parse(composeOf('site'))
    expect(site.name).toBe('agenthix-site')
    expect(site.services.site.environment.HOST_NAMESPACE).toBe('agenthix')
  })

  it('rolls back to the previous images and the backup when HQ does not come up healthy, and says so', async () => {
    m.backups.databases.set('agenthix_hq', Buffer.from('rows at 0.2.0'))
    m.ctx.hqControl.status = async () => {
      // The new version changes its database as it starts, then never answers.
      m.backups.databases.set('agenthix_hq', Buffer.from('migrated by 0.2.1'))
      return null
    }
    const outcome = await upgrade(m.ctx, 'hq', '0.2.1', () => {})
    expect(outcome.rolledBack).toBe(true)
    expect(outcome.version).toBe('0.2.0')
    expect(outcome.rolledBack && outcome.reason).toMatch(/^HQ did not pass its health check: hq-server did not answer within 1 minute\. The host service restored the backup from \d\d:\d\d, and HQ is on 0\.2\.0 again\.$/)
    expect(m.backups.databases.get('agenthix_hq')!.toString()).toBe('rows at 0.2.0')
    expect(installed(m.ctx).hq!.settings).toMatchObject({ version: '0.2.0', images: { 'hq-server': pinned('hq-server', '0.2.0') } })
    expect(composeOf('hq')).toContain(pinned('hq-web', '0.2.0'))
    expect(composeOf('site')).toContain(pinned('site-server', '0.2.0'))
    expect(m.up.has('agenthix-hq') && m.up.has('agenthix-site')).toBe(true)
    const s = readUpgrades(m.ctx.state)
    expect(s.underWay).toBeNull()
    expect(s.rolledBack).toEqual(['hq@0.2.1'])
  })

  it('rolls back when HQ answers but its site does not connect', async () => {
    hqAnswers('0.2.1')
    hqStatus.hqSite = { state: 'notConnected', dockerRunning: true }
    const outcome = await upgrade(m.ctx, 'hq', '0.2.1', () => {})
    expect(outcome.rolledBack && outcome.reason).toContain('the site hq-box did not connect to HQ within 1 minute')
  })

  it('goes back to what was there when the backup cannot be taken, and changes nothing', async () => {
    m.backups.failDump.add('agenthix_hq')
    await expect(upgrade(m.ctx, 'hq', '0.2.1', () => {})).rejects.toThrow(/^Not upgraded, since an upgrade takes a backup first: .* HQ is started again on 0\.2\.0\.$/)
    expect(installed(m.ctx).hq!.settings.version).toBe('0.2.0')
    expect(m.up.has('agenthix-hq')).toBe(true)
  })

  it('goes forward only, and not past the host service’s own version', async () => {
    await expect(upgrade(m.ctx, 'hq', '0.2.0', () => {})).rejects.toThrow('HQ is already on 0.2.0. Nothing was changed.')
    await expect(upgrade(m.ctx, 'hq', '0.1.9', () => {})).rejects.toThrow('An upgrade only goes forward')
    await expect(upgrade(m.ctx, 'hq', '0.3.0', () => {})).rejects.toThrow('HQ 0.3.0 needs the host service 0.3 first; this one is 0.2.0.')
    expect(m.checked).toEqual([])
  })

  it('takes the site no further than the HQ it carries', async () => {
    await expect(upgrade(m.ctx, 'site', '0.2.1', () => {})).rejects.toThrow('This site carries HQ, which is on 0.2.0')
  })

  it('does not upgrade a development build', async () => {
    m.ctx.machine.hostServiceVersion = 'dev'
    await expect(upgrade(m.ctx, 'hq', '0.2.1', () => {})).rejects.toThrow('development build')
  })
})

describe('an upgrade a restart cut short @SC-835', () => {
  async function cutShort(): Promise<void> {
    const backup = await takeBackup(m.ctx, 'now')
    const before = installed(m.ctx)
    writeUpgrades(m.ctx.state, s => {
      s.underWay = { target: 'hq', to: '0.2.1', from: '0.2.0', hq: before.hq!.settings, site: before.site!.settings, backupId: backup.id, backupTakenAt: backup.takenAt }
    })
  }

  it('is finished when HQ comes up as the new version', async () => {
    await cutShort()
    hqAnswers('0.2.1')
    expect(await finishUnderWay(m.ctx)).toEqual({ version: '0.2.1', rolledBack: false })
    expect(readUpgrades(m.ctx.state).underWay).toBeNull()
  })

  it('is put back when it does not', async () => {
    await cutShort()
    hqAnswers(null)
    expect(await finishUnderWay(m.ctx)).toMatchObject({ version: '0.2.0', rolledBack: true })
  })

  it('writes down what it stops before it stops anything', async () => {
    const seen: unknown[] = []
    const stop = m.ctx.docker.composeStop.bind(m.ctx.docker)
    m.ctx.docker.composeStop = async (project, file) => {
      seen.push(readUpgrades(m.ctx.state).stopping)
      return stop(project, file)
    }
    hqAnswers('0.2.1')
    await upgrade(m.ctx, 'hq', '0.2.1', () => {})
    expect(seen[0]).toMatchObject({ target: 'hq', from: '0.2.0', to: '0.2.1' })
    expect(readUpgrades(m.ctx.state).stopping).toBeNull()
  })

  it('starts HQ and its site again when a restart came while the backup was taken', async () => {
    m.ctx.docker.composeStop = async () => { throw new Error('the host service stopped') }
    await expect(upgrade(m.ctx, 'hq', '0.2.1', () => {})).rejects.toThrow('the host service stopped')
    m.up.clear()
    expect(await finishUnderWay(m.ctx)).toEqual({
      version: '0.2.0', rolledBack: true,
      reason: 'The upgrade to 0.2.1 stopped before its backup was taken, so nothing was changed; HQ and its site are started again on 0.2.0.',
    })
    expect(m.up.has('agenthix-hq') && m.up.has('agenthix-site')).toBe(true)
    expect(readUpgrades(m.ctx.state)).toMatchObject({ stopping: null, underWay: null, rolledBack: [] })
    expect(installed(m.ctx).hq!.settings.version).toBe('0.2.0')
  })
})

describe('a scheduled upgrade @SC-839', () => {
  const MIN = 60_000
  const inMinutes = (n: number) => new Date(m.ctx.now().getTime() + n * MIN).toISOString()
  const sent = () => m.calls.filter(c => c[0] === 'exec' && c.includes('scheduled-change')).map(c => JSON.parse(c[c.length - 1]) as ScheduledChangeNotice)

  it('is a scheduled change HQ hears of, named with its version, and runs at its time', async () => {
    const change = await scheduleChange(m.ctx, { op: 'upgrade', target: 'hq', version: '0.2.1' }, inMinutes(60), { kind: 'machineAdmin' })
    expect(change).toMatchObject({ kind: 'upgrade', target: 'hq', detail: '0.2.1', expectedMinutes: 20 })
    hqAnswers('0.2.1')
    await m.ctx.sleep(60 * MIN)
    await tickScheduled(m.ctx)
    expect(installed(m.ctx).hq!.settings.version).toBe('0.2.1')
    expect(listScheduled(m.ctx)).toEqual([])
    expect(sent().map(n => n.update)).toContain('completed')
  })

  it('is refused when it is scheduled, in words, when it could not run', async () => {
    await expect(scheduleChange(m.ctx, { op: 'upgrade', target: 'hq', version: '0.2.0' }, inMinutes(60), { kind: 'machineAdmin' }))
      .rejects.toThrow('already on 0.2.0')
  })

  it('runs again after a restart cut it short, however long the host service was down', async () => {
    await scheduleChange(m.ctx, { op: 'upgrade', target: 'hq', version: '0.2.1' }, inMinutes(60), { kind: 'machineAdmin' })
    await m.ctx.sleep(60 * MIN)
    // As a restart leaves it: the change still running, and the upgrade's record of what it stopped.
    writeUpgrades(m.ctx.state, s => { s.stopping = { target: 'hq', to: '0.2.1', from: '0.2.0', at: m.ctx.now().toISOString() } })
    const store = readStore(m.ctx.state)
    store.entries[0].change.state = 'running'
    m.ctx.state.writeJson(['scheduled.json'], store)
    m.up.clear()
    hqAnswers('0.2.1')
    await m.ctx.sleep(3 * 60 * MIN)
    await tickScheduled(m.ctx)
    expect(readStore(m.ctx.state).entries[0].change.state).toBe('done')
    expect(installed(m.ctx).hq!.settings.version).toBe('0.2.1')
    expect(m.up.has('agenthix-hq')).toBe(true)
  })

  it('tells HQ it failed and was rolled back, with why', async () => {
    await scheduleChange(m.ctx, { op: 'upgrade', target: 'hq', version: '0.2.1' }, inMinutes(60), { kind: 'machineAdmin' })
    hqAnswers(null)
    await m.ctx.sleep(60 * MIN)
    await tickScheduled(m.ctx)
    const entry = readStore(m.ctx.state).entries[0]
    expect(entry.change.state).toBe('rolledBack')
    expect(entry.notice?.reason).toMatch(/^The upgrade of HQ did not complete, and was put back as it was: HQ did not pass its health check: hq-server did not answer/)
    expect(installed(m.ctx).hq!.settings.version).toBe('0.2.0')
  })
})
