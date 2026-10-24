import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { digestOf, fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { listScheduled } from '../../scheduled/scheduler'
import { checkPublished, scheduleFix, setUpgrades, upgradesTick } from '../automatic'
import { readyHostService } from '../hostService'
import { nextWindowStart, parseWindow, readUpgrades, windowText, writeUpgrades } from '../settings'
import { upgradesStatus } from '../status'
import { NothingPublished, isFixOf, publishedVersions } from '../versions'
import '../operations'

let m: FakeMachine
const HQ_PARTS = ['hq-server', 'hq-web', 'site-server', 'agent']

/** Every image of HQ and its site published at these versions, and the host service at `host`. */
function publish(versions: string[], host: string[] = versions): void {
  for (const part of HQ_PARTS) m.tags.set(`solution84-com/agenthix-${part}`, ['latest', ...versions])
  m.tags.set('solution84-com/agenthix-host', host)
}

beforeEach(async () => {
  m = fakeMachine()
  await install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
  m.hq['scheduled-change'] = { ok: true, text: 'Taken.' }
})
afterEach(() => m.cleanup())

describe('the published versions @SC-836', () => {
  it('are those every image carries, release numbers only, oldest first', async () => {
    publish(['0.2.0', '0.2.1', '0.10.0'])
    m.tags.set('solution84-com/agenthix-agent', ['0.2.0', '0.10.0'])
    expect(await publishedVersions(m.ctx, HQ_PARTS as never)).toEqual({ ok: true, versions: ['0.2.0', '0.10.0'] })
  })

  it('say that nothing is published yet when the registry holds no such image, without a token or a status code', async () => {
    m.ctx.registryTags = async () => { throw new NothingPublished() }
    expect(await publishedVersions(m.ctx, ['host'])).toEqual({ ok: false, problem: 'No version has been published yet, so no upgrade is offered.' })
  })

  it('fail closed when the registry cannot be read, and say so', async () => {
    m.registryDown.reason = 'getaddrinfo ENOTFOUND ghcr.io'
    expect(await publishedVersions(m.ctx, ['host'])).toEqual({
      ok: false, problem: 'The published versions could not be read (getaddrinfo ENOTFOUND ghcr.io), so no upgrade is offered.',
    })
    await upgradesTick(m.ctx)
    expect(listScheduled(m.ctx)).toEqual([])
    expect(upgradesStatus(m.ctx)).toMatchObject({ ready: null, problem: expect.stringContaining('could not be read') })
  })
})

describe('automatic fixes @SC-837', () => {
  it('are on by default, in the window Sunday 02:00–04:00', () => {
    expect(readUpgrades(m.ctx.state)).toMatchObject({ auto: true })
    expect(windowText(readUpgrades(m.ctx.state).window)).toBe('Sunday 02:00–04:00')
  })

  it('schedule the newest fix for the start of the window, as a scheduled change', async () => {
    publish(['0.2.0', '0.2.1', '0.2.3'])
    await upgradesTick(m.ctx)
    const [change] = listScheduled(m.ctx)
    expect(change).toMatchObject({ kind: 'upgrade', target: 'hq', detail: '0.2.3', state: 'scheduled', scheduledBy: { kind: 'maintenanceWindow' } })
    expect(new Date(change.at)).toEqual(new Date(2026, 9, 18, 2, 0))
    expect(readUpgrades(m.ctx.state).automatic).toEqual([change.id])
    await upgradesTick(m.ctx)
    expect(listScheduled(m.ctx)).toHaveLength(1)
  })

  it('never apply a new minor or major version by themselves', async () => {
    publish(['0.2.0', '0.3.0', '1.0.0'])
    await upgradesTick(m.ctx)
    expect(listScheduled(m.ctx)).toEqual([])
    expect(upgradesStatus(m.ctx).ready).toMatchObject({ version: '1.0.0', fix: false, hostServiceFirst: true })
  })

  it('never apply again by themselves a fix that was rolled back', async () => {
    publish(['0.2.0', '0.2.1'])
    writeUpgrades(m.ctx.state, s => { s.rolledBack = ['hq@0.2.1'] })
    await upgradesTick(m.ctx)
    expect(listScheduled(m.ctx)).toEqual([])
    expect(upgradesStatus(m.ctx).ready).toMatchObject({ version: '0.2.1', fix: true, rolledBack: true })
  })

  it('schedule nothing when turned off, and turning them off cancels what they scheduled', async () => {
    publish(['0.2.0', '0.2.1'])
    await upgradesTick(m.ctx)
    expect(listScheduled(m.ctx)).toHaveLength(1)
    await setUpgrades(m.ctx, { auto: false })
    expect(listScheduled(m.ctx)).toEqual([])
    await upgradesTick(m.ctx)
    expect(listScheduled(m.ctx)).toEqual([])
    expect(upgradesStatus(m.ctx)).toMatchObject({ auto: false, ready: { version: '0.2.1', fix: true } })
  })

  it('move with the window', async () => {
    publish(['0.2.0', '0.2.1'])
    await upgradesTick(m.ctx)
    const window = parseWindow('daily 23:00-01:00')
    if ('problem' in window) throw new Error(window.problem)
    await setUpgrades(m.ctx, { window })
    expect(new Date(listScheduled(m.ctx)[0].at)).toEqual(new Date(2026, 9, 14, 23, 0))
  })

  it('leave alone an upgrade someone else scheduled', async () => {
    publish(['0.2.0', '0.2.1'])
    const { versions } = await checkPublished(m.ctx)
    await setUpgrades(m.ctx, { auto: false })
    writeUpgrades(m.ctx.state, s => { s.auto = true })
    const first = await scheduleFix(m.ctx, versions)
    expect(first).not.toBeNull()
    expect(await scheduleFix(m.ctx, versions)).toBeNull()
  })
})

describe('the maintenance window @SC-837', () => {
  it('reads a day or daily, and two times', () => {
    expect(parseWindow('Sun 02:00-04:00')).toEqual({ day: 0, startMinute: 120, endMinute: 240 })
    expect(parseWindow('saturday 22:30–23:30')).toEqual({ day: 6, startMinute: 1350, endMinute: 1410 })
    expect(parseWindow('daily 23:00-01:00')).toEqual({ day: null, startMinute: 1380, endMinute: 60 })
    expect(parseWindow('Sun 02:00')).toHaveProperty('problem')
    expect(parseWindow('Funday 02:00-04:00')).toHaveProperty('problem')
    expect(parseWindow('Sun 02:00-02:00')).toHaveProperty('problem')
  })

  it('takes the next window with an hour’s notice', () => {
    const w = { day: null, startMinute: 120, endMinute: 240 }
    expect(nextWindowStart(w, new Date(2026, 9, 14, 1, 30), 60 * 60_000)).toEqual(new Date(2026, 9, 15, 2, 0))
    expect(nextWindowStart(w, new Date(2026, 9, 14, 0, 30), 60 * 60_000)).toEqual(new Date(2026, 9, 14, 2, 0))
  })

  it('a fix is a later patch of the same major and minor version', () => {
    expect(isFixOf('0.2.1', '0.2.0')).toBe(true)
    expect(isFixOf('0.3.0', '0.2.0')).toBe(false)
    expect(isFixOf('1.2.1', '0.2.0')).toBe(false)
    expect(isFixOf('0.2.0', '0.2.1')).toBe(false)
  })
})

describe('the host service’s own image @SC-838', () => {
  it('is checked and fetched by its digest, and switched to by hand with its recorded settings', async () => {
    publish(['0.2.0', '0.3.0'])
    m.calls.length = 0
    const ready = await readyHostService(m.ctx)
    const ref = 'ghcr.io/solution84-com/agenthix-host:0.3.0'
    const image = `ghcr.io/solution84-com/agenthix-host@${digestOf(ref)}`
    // Started by its version's tag and its digest, so the host service started from it knows its version.
    const startFrom = `ghcr.io/solution84-com/agenthix-host:0.3.0@${digestOf(ref)}`
    expect(m.checked.at(-1)).toEqual([ref, 'https://github.com/solution84-com/agenthix/.github/workflows/publish-images.yml@refs/tags/v0.3.0'])
    // Fetched by its digest, unless it is on the machine already, as it is here.
    expect(m.calls.filter(c => c[0] === 'image' || c[0] === 'pull').map(c => c.at(-1))).toEqual([image])
    expect(ready).toEqual({
      from: '0.2.0',
      version: '0.3.0',
      image,
      launcher: true,
      commands: [
        'docker rm -f agenthix-host',
        'docker run -d --name agenthix-host --restart unless-stopped --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock ' +
          '--mount type=bind,src=/home/sam/.agenthix,dst=/state --mount type=volume,src=agenthix-host-figures,dst=/run/host-figures ' +
          `--network host --cap-add NET_ADMIN -e TZ=Europe/London --label com.docker.compose.project=agenthix-host ${startFrom}`,
      ],
    })
  })

  it('is switched to with the documented command when its settings cannot be read back', async () => {
    publish(['0.2.0', '0.3.0'])
    m.containers.byName('agenthix-host')!.name = 'elsewhere'
    const ready = await readyHostService(m.ctx)
    expect(ready.commands[1]).toBe('docker run -d --name agenthix-host --restart unless-stopped -v /var/run/docker.sock:/var/run/docker.sock ' +
      '-v /home/sam/.agenthix:/state -v agenthix-host-figures:/run/host-figures --network host --cap-add NET_ADMIN ' +
      `--label com.docker.compose.project=agenthix-host ${ready.image.replace('@', ':0.3.0@')}`)
  })

  it('is refused unsigned, and nothing is fetched', async () => {
    m.signatures.set('ghcr.io/solution84-com/agenthix-host:0.3.0', { kind: 'unsigned' })
    m.calls.length = 0
    await expect(readyHostService(m.ctx, '0.3.0')).rejects.toThrow('carries no signature')
    expect(m.calls.filter(c => c[0] === 'pull')).toEqual([])
  })
})
