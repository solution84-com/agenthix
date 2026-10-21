import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ScheduledChangeNotice } from '@agenthix/core'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { ownerHandler } from '../../owner/dispatch'
import { installed } from '../../service/context'
import { listScheduled, tickScheduled } from '../../scheduled/scheduler'
import { readStore } from '../../scheduled/store'
import { binEntries, GRACE_DAYS, purgeDue } from '../bin'
import { lifecycleStatus } from '../status'
import { noteFiguresRead, TOLD_WAIT_MS } from '../siteTold'

const ADDRESS = 'https://hq.acme.example'
const DAY = 24 * 60 * 60_000
const NAS = '/mnt/nas/agenthix'

let m: FakeMachine
const ask = (data: unknown, steps: string[] = []) =>
  ownerHandler(m.ctx)(data, p => { if (p.event === 'step') steps.push(p.step) }) as Promise<Record<string, any>>
const composeDowns = () => m.calls.filter(c => c[0] === 'compose' && c.includes('down')).map(c => c[c.indexOf('-p') + 1])
const nas = () => fs.readdirSync(m.backups.onMachine(NAS))
const sentToHq = (): ScheduledChangeNotice[] =>
  m.calls.filter(c => c[0] === 'exec' && c.includes('scheduled-change')).map(c => JSON.parse(c[c.length - 1]) as ScheduledChangeNotice)

async function setLocation(): Promise<void> {
  fs.mkdirSync(m.backups.onMachine(NAS), { recursive: true })
  const prepared = await ask({ op: 'backup.location', path: NAS })
  await ask({ op: 'backup.locationConfirm', pendingId: prepared.result.pendingId })
}

beforeEach(async () => {
  m = fakeMachine()
  await install(m.ctx, ADDRESS, () => {})
  m.hq['scheduled-change'] = { ok: true, text: 'Taken.' }
  m.agentContainers.push('agenthix-agent-1', 'agenthix-agent-2')
  m.agentNetworks.push('agenthix-agent-1-net', 'agenthix-agent-2-net')
  fs.writeFileSync(`${m.ctx.state.folder('site', 'data')}/workspace.txt`, 'work')
  m.calls.length = 0
})
afterEach(() => m.cleanup())

describe('erasing HQ @SC-843', () => {
  it("takes the agents' group down by its label, after the site's project, which never held them @SC-1156", async () => {
    expect(await ask({ op: 'erase', target: 'hq', confirmAddress: ADDRESS })).toMatchObject({ ok: true })
    const group = 'label=com.docker.compose.project=agenthix-agents'
    const ps = m.calls.findIndex(c => c[0] === 'ps' && c.includes(group))
    const siteDown = m.calls.findIndex(c => c[0] === 'compose' && c.includes('agenthix-site') && c.includes('down'))
    expect(siteDown).toBeGreaterThanOrEqual(0)
    expect(ps).toBeGreaterThan(siteDown)
    expect(m.calls).toContainEqual(['rm', '--force', 'agenthix-agent-1', 'agenthix-agent-2'])
    expect(m.calls).toContainEqual(['network', 'rm', 'agenthix-agent-1-net', 'agenthix-agent-2-net'])
    expect(m.calls.some(c => c.some(a => a.startsWith('name=')))).toBe(false)
  })

  it('is refused without HQ’s address typed in exactly, and nothing changes', async () => {
    for (const typed of ['https://hq.acme.example/', 'hq.acme.example']) {
      const r = await ask({ op: 'erase', target: 'hq', confirmAddress: typed })
      expect(r).toMatchObject({ ok: false, refusal: { code: 'conflict' } })
      expect(r.refusal.message).toMatch(/^Not erased: that is not HQ's address \(it is https:\/\/hq\.acme\.example/)
    }
    expect((await ask({ op: 'erase', target: 'hq', confirmAddress: 'https://hq.acme.example/' })).refusal.message)
      .toContain('without the slash). Nothing changed.')
    expect(composeDowns()).toEqual([])
    expect(installed(m.ctx).hq).not.toBeNull()
    expect(binEntries(m.ctx)).toEqual([])
  })

  it('removes nothing when the final backup fails', async () => {
    m.backups.failDump.add(m.ctx.names.hqDatabase)
    const r = await ask({ op: 'erase', target: 'hq', confirmAddress: ADDRESS })
    expect(r).toMatchObject({ ok: false, refusal: { code: 'failed' } })
    expect(r.refusal.message).toMatch(/^Not erased: the final backup did not complete, so nothing was removed\./)
    expect(composeDowns()).toEqual([])
    expect(m.agentContainers).toHaveLength(2)
    expect(installed(m.ctx).hq).not.toBeNull()
    expect(fs.existsSync(m.ctx.state.path('site', 'data', 'workspace.txt'))).toBe(true)
    expect(binEntries(m.ctx)).toEqual([])
  })

  it('at once: takes a final sealed backup, removes the running data, and keeps the backup 30 days', async () => {
    await setLocation()
    const steps: string[] = []
    const r = await ask({ op: 'erase', target: 'hq', confirmAddress: ADDRESS }, steps)
    expect(r).toMatchObject({ ok: true, result: { inLocation: true, hqTold: null } })
    expect(Date.parse(r.result.purgeAfter) - m.ctx.now().getTime()).toBeGreaterThan((GRACE_DAYS - 1) * DAY)
    expect(steps).toEqual(['Taking the final sealed backup', 'Stopping HQ and its site', 'Removing the running data'])
    expect(composeDowns()).toEqual([m.ctx.names.siteProject, m.ctx.names.hqProject])
    expect(m.calls.find(c => c[0] === 'compose' && c.includes('down'))).toContain('--volumes')
    expect(m.agentContainers).toEqual([])
    expect(m.agentNetworks).toEqual([])
    expect(installed(m.ctx)).toEqual({ hq: null, site: null })
    expect(fs.existsSync(m.ctx.state.path('site'))).toBe(false)
    expect(fs.existsSync(m.ctx.state.path('secrets.json'))).toBe(false)
    const [entry] = binEntries(m.ctx)
    expect(entry).toMatchObject({ target: 'hq', hqAddress: ADDRESS, siteName: 'hq-box' })
    expect(fs.existsSync(m.ctx.state.path('bin', entry.finalBackup))).toBe(true)
    expect(nas()).toContain(entry.finalBackup)
    // Members heard of it as of any scheduled change; it ran at once.
    expect(sentToHq().map(n => n.update)).toEqual(['scheduled', 'started'])
    expect(sentToHq()[0].change).toMatchObject({ kind: 'erase', target: 'hq' })
  })

  it('ends what else was scheduled for HQ or its site, as cancelled with the reason', async () => {
    const small = { memoryBytesPerContainer: 512 * 1024 ** 2, cpusPerContainer: 1, processesPerContainer: 256, containersAtOnce: 1 }
    const at = new Date(m.ctx.now().getTime() + DAY).toISOString()
    const later = await ask({ op: 'schedule', at, change: { op: 'capacity.set', ceilings: small } })
    expect(later).toMatchObject({ ok: true })
    await ask({ op: 'erase', target: 'hq', confirmAddress: ADDRESS })
    expect(listScheduled(m.ctx)).toEqual([])
    const ended = sentToHq().filter(n => n.change.id === later.result.change.id)
    expect(ended.map(n => n.update)).toEqual(['scheduled'])
    expect(readStore(m.ctx.state).entries.find(e => e.change.id === later.result.change.id)?.notice)
      .toMatchObject({ update: 'cancelled', reason: 'The resize of the site hq-box was cancelled: the site hq-box is no longer on hq-box.' })
  })

  it('is brought back from the bin within the grace period', async () => {
    await ask({ op: 'erase', target: 'hq', confirmAddress: ADDRESS })
    await m.ctx.sleep(9 * DAY)
    await purgeDue(m.ctx)
    const steps: string[] = []
    const r = await ask({ op: 'erased.restore', target: 'hq' }, steps)
    expect(r).toMatchObject({ ok: true, result: { hqAddress: ADDRESS, siteName: 'hq-box', hqAnswers: true } })
    expect(installed(m.ctx).hq?.settings.address).toBe(ADDRESS)
    expect(binEntries(m.ctx)).toEqual([])
    expect(steps).toContain("Restoring HQ's database")
  })

  it('is reported by status only while nothing runs on the machine: a new HQ or site here is not what was erased', async () => {
    await ask({ op: 'erase', target: 'hq', confirmAddress: ADDRESS })
    expect(lifecycleStatus(m.ctx).erased).toMatchObject([{ target: 'hq', siteName: 'hq-box' }])
    await install(m.ctx, 'https://hq2.acme.example', () => {})
    expect(lifecycleStatus(m.ctx).erased).toEqual([])
    // The bin keeps it for its grace period all the same.
    expect(binEntries(m.ctx)).toHaveLength(1)
  })

  it('is purged after the grace period, the backup location’s copies included', async () => {
    await setLocation()
    await ask({ op: 'backup.take' })
    await ask({ op: 'erase', target: 'hq', confirmAddress: ADDRESS })
    const [entry] = binEntries(m.ctx)
    expect(nas()).toContain(entry.finalBackup)
    await m.ctx.sleep((GRACE_DAYS - 1) * DAY)
    await purgeDue(m.ctx)
    expect(binEntries(m.ctx)).toHaveLength(1)
    await m.ctx.sleep(2 * DAY)
    await purgeDue(m.ctx)
    expect(binEntries(m.ctx)).toEqual([])
    expect(fs.readdirSync(m.ctx.state.path('bin')).filter(n => n.endsWith('.sealed'))).toEqual([])
    expect(nas().filter(n => n.startsWith('hq-box-'))).toEqual([])
    expect(await ask({ op: 'erased.restore', target: 'hq' })).toMatchObject({ ok: false, refusal: { code: 'not_found' } })
  })

  it('keeps an entry whose copies in the backup location cannot be removed, and says why', async () => {
    await setLocation()
    await ask({ op: 'erase', target: 'hq', confirmAddress: ADDRESS })
    const remove = m.backups.folder.remove
    m.backups.folder.remove = async () => { throw new Error('the share is offline') }
    await m.ctx.sleep((GRACE_DAYS + 1) * DAY)
    await purgeDue(m.ctx)
    expect(binEntries(m.ctx)[0].purgeProblem).toContain('the share is offline')
    m.backups.folder.remove = remove
    await purgeDue(m.ctx)
    expect(binEntries(m.ctx)).toEqual([])
  })

  it('on a date: shows the countdown from now, and a cancelled erase leaves everything as it was', async () => {
    const at = new Date(m.ctx.now().getTime() + 2 * DAY).toISOString()
    const r = await ask({ op: 'schedule', at, change: { op: 'erase', target: 'hq', confirmAddress: ADDRESS } })
    expect(r).toMatchObject({ ok: true, result: { change: { kind: 'erase', target: 'hq', state: 'scheduled' } } })
    await tickScheduled(m.ctx)
    expect(sentToHq().map(n => n.update)).toEqual(['scheduled'])
    expect(await ask({ op: 'schedule.cancel', changeId: r.result.change.id })).toMatchObject({ ok: true })
    await m.ctx.sleep(3 * DAY)
    await tickScheduled(m.ctx)
    expect(sentToHq().map(n => n.update)).toEqual(['scheduled', 'cancelled'])
    expect(composeDowns()).toEqual([])
    expect(installed(m.ctx).hq).not.toBeNull()
    expect(binEntries(m.ctx)).toEqual([])
  })

  it('on a date: runs at its time, and refuses to schedule without the address', async () => {
    const at = new Date(m.ctx.now().getTime() + DAY).toISOString()
    expect(await ask({ op: 'schedule', at, change: { op: 'erase', target: 'hq', confirmAddress: 'nope' } })).toMatchObject({ ok: false })
    await ask({ op: 'schedule', at, change: { op: 'erase', target: 'hq', confirmAddress: ADDRESS } })
    await m.ctx.sleep(DAY)
    await tickScheduled(m.ctx)
    expect(installed(m.ctx).hq).toBeNull()
    expect(Date.parse(binEntries(m.ctx)[0].erasedAt)).toBe(Date.parse(at))
    expect(listScheduled(m.ctx)).toEqual([])
  })
})

describe('erasing a site @SC-844', () => {
  it('is refused where the site carries HQ', async () => {
    const r = await ask({ op: 'erase', target: 'site' })
    expect(r.refusal.message).toBe('The site hq-box carries HQ here, so it is erased only with HQ: agenthix hq erase')
  })

  it('on its own machine: erases it at once, and says HQ was not told when the site is not connected', async () => {
    fs.rmSync(m.ctx.state.path('hq'), { recursive: true })
    const r = await ask({ op: 'erase', target: 'site' })
    expect(r).toMatchObject({ ok: true, result: { hqTold: false } })
    expect(composeDowns()).toEqual([m.ctx.names.siteProject])
    expect(binEntries(m.ctx)[0]).toMatchObject({ target: 'site', siteName: 'hq-box', hqAddress: null })
  })

  it('says HQ was told once the connected site read the erase’s notice, and not when it did not read it in time', async () => {
    fs.rmSync(m.ctx.state.path('hq'), { recursive: true })
    m.siteReport.value = { type: 'status', status: { problem: null, hq: { connected: true } } }
    const sleep = m.ctx.sleep
    m.ctx.sleep = async ms => { noteFiguresRead(m.ctx); await sleep(ms) }
    expect(await ask({ op: 'erase', target: 'site' })).toMatchObject({ ok: true, result: { hqTold: true } })
  })

  it('does not say HQ was told when the site did not read the figures in time', async () => {
    fs.rmSync(m.ctx.state.path('hq'), { recursive: true })
    m.siteReport.value = { type: 'status', status: { problem: null, hq: { connected: true } } }
    const before = m.ctx.now().getTime()
    expect(await ask({ op: 'erase', target: 'site' })).toMatchObject({ ok: true, result: { hqTold: false } })
    expect(m.ctx.now().getTime() - before).toBeGreaterThanOrEqual(TOLD_WAIT_MS)
  })
})
