import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { ownerHandler } from '../../owner/dispatch'
import { parseOwnerRequest } from '../../owner/requests'
import { installed } from '../../service/context'
import { listScheduled, tickScheduled } from '../../scheduled/scheduler'
import type { HqStatusData } from '../../hq/control'
import type { UpgradesStatus } from '../../upgrades/status'
import { parseCommand } from '../commands'
import { runCommand, type Io, type Send } from '../run'
import { upgradeLines } from '../upgrades'

let m: FakeMachine
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
const cli = (...argv: string[]) => runCommand(parseCommand(argv), send, io, '0.2.0', () => m.ctx.now())
const flat = (s: string) => s.replace(/\s+/g, ' ')

function publish(versions: string[]): void {
  for (const part of ['hq-server', 'hq-web', 'site-server', 'agent', 'host']) m.tags.set(`solution84-com/agenthix-${part}`, versions)
}
function hqAnswersAs(version: string): void {
  const data = (m.hq.status as unknown as { data: HqStatusData }).data
  m.hq.status = { ok: true, text: 'HQ', data: { ...data, version } }
}

beforeEach(async () => {
  m = fakeMachine()
  await install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
  m.hq['scheduled-change'] = { ok: true, text: 'Taken.' }
  out = ''
  err = ''
  answers = []
})
afterEach(() => m.cleanup())

describe('agenthix hq upgrade @SC-836', () => {
  it('takes the newest published version, asks, and schedules it five minutes ahead so HQ gives notice', async () => {
    publish(['0.2.0', '0.2.1'])
    hqAnswersAs('0.2.1')
    answers = ['y']
    expect(await cli('hq', 'upgrade')).toBe(0)
    const said = flat(out)
    expect(said).toMatch(/Upgrading HQ from 0\.2\.0 to 0\.2\.1, starting at \d\d:\d\d, in 5 minutes\. HQ tells everyone in HQ now, and until then no new runs start and runs going pause after their current step\./)
    expect(said).toContain('Then HQ and its site stop for a few minutes: a sealed backup is taken first')
    expect(said).not.toContain('Runs going now stop')
    expect(said).toMatch(/Scheduled as 1\. HQ will be upgraded to 0\.2\.1 at \d\d:\d\d\./)
    expect(said).toContain('To cancel before then: agenthix schedule cancel 1')
    const [change] = listScheduled(m.ctx)
    expect(change).toMatchObject({ kind: 'upgrade', detail: '0.2.1', scheduledBy: { kind: 'machineAdmin' } })
    expect(Date.parse(change.at) - m.ctx.now().getTime()).toBe(5 * 60_000)
    expect(m.calls.filter(c => c.includes('scheduled-change')).length).toBeGreaterThan(0)

    await m.ctx.sleep(5 * 60_000)
    await tickScheduled(m.ctx)
    expect(installed(m.ctx).hq!.settings.version).toBe('0.2.1')
  })

  it('changes nothing when the person says no', async () => {
    publish(['0.2.0', '0.2.1'])
    answers = ['n']
    expect(await cli('hq', 'upgrade')).toBe(1)
    expect(listScheduled(m.ctx)).toEqual([])
  })

  it('says in status, afterwards, that it rolled back, why, and where to look', async () => {
    expect(await cli('hq', 'upgrade', '0.2.1', '--yes')).toBe(0)
    m.hq.status = null
    await m.ctx.sleep(5 * 60_000)
    await tickScheduled(m.ctx)
    out = ''
    expect(await cli('status')).toBe(0)
    const said = flat(out)
    expect(said).toContain('The upgrade to 0.2.1 on')
    expect(said).toContain('failed and was rolled back. HQ did not pass its health check: hq-server did not answer within 1 minute.')
    expect(said).toContain('HQ is on 0.2.0 again. To see why: agenthix hq logs')
  })

  it('offers no upgrade when the published versions cannot be read', async () => {
    m.registryDown.reason = 'getaddrinfo ENOTFOUND ghcr.io'
    expect(await cli('hq', 'upgrade', '--yes')).toBe(1)
    expect(flat(err)).toContain('The published versions could not be read (getaddrinfo ENOTFOUND ghcr.io), so no upgrade is offered.')
    expect(m.checked.filter(c => c[0].includes('0.2.1'))).toEqual([])
  })

  it('says when HQ is on the newest version', async () => {
    publish(['0.1.0', '0.2.0'])
    expect(await cli('hq', 'upgrade')).toBe(0)
    expect(flat(out)).toContain('HQ is on 0.2.0, the newest published version. Nothing to upgrade.')
  })

  it('with the launcher off, readies the host service first for a newer version, and prints the commands whole', async () => {
    publish(['0.2.0', '0.3.0'])
    expect(await cli('upgrades', 'host', '--launcher', 'off')).toBe(0)
    expect(await cli('hq', 'upgrade', '0.3.0')).toBe(1)
    expect(flat(out)).toContain('HQ 0.3.0 needs the host service 0.3.0 first; this one is older.')
    expect(out).toContain('  docker rm -f agenthix-host\n')
    expect(out).toMatch(/\n {2}docker run -d --name agenthix-host .* ghcr\.io\/solution84-com\/agenthix-host@sha256:[0-9a-f]{64}\n/)
    expect(flat(out)).toContain('Then: agenthix hq upgrade 0.3.0')
    expect(installed(m.ctx).hq!.settings.version).toBe('0.2.0')
  })

  it('schedules it with --at, and HQ is told', async () => {
    expect(await cli('hq', 'upgrade', '0.2.1', '--at', 'tomorrow 02:00')).toBe(0)
    expect(flat(out)).toContain('Scheduled. HQ will be upgraded to 0.2.1 on')
    expect(listScheduled(m.ctx)[0]).toMatchObject({ kind: 'upgrade', detail: '0.2.1' })
  })

  it('schedules it the same way through hq schedule upgrade, and asks for a time', async () => {
    expect(await cli('hq', 'schedule', 'upgrade', '0.2.1', '--at', 'tomorrow 02:00')).toBe(0)
    expect(listScheduled(m.ctx)).toHaveLength(1)
    expect(await cli('hq', 'schedule', 'upgrade')).toBe(2)
    expect(flat(err)).toContain('Say when, in this machine\'s time: agenthix hq schedule upgrade --at "Sun 18 Oct 04:00"')
  })

  it('refuses what is not a version', async () => {
    expect(await cli('hq', 'upgrade', 'latest')).toBe(2)
  })

  it('takes a pre-release as the version to upgrade to', () => {
    expect(parseCommand(['hq', 'upgrade', '1.0.0-alpha.2'])).toMatchObject({ kind: 'upgrade', target: 'hq', version: '1.0.0-alpha.2' })
  })
})

describe('agenthix upgrades @SC-837', () => {
  it('shows automatic fixes on, with their window', async () => {
    expect(await cli('upgrades')).toBe(0)
    expect(flat(out)).toContain('Automatic fixes on')
    expect(flat(out)).toContain('applies by itself in the maintenance window, Sunday 02:00–04:00, after a backup')
  })

  it('turns them off, and moves the window', async () => {
    publish(['0.2.0'])
    expect(await cli('upgrades', 'auto', 'off')).toBe(0)
    expect(flat(out)).toContain('Automatic fixes off')
    out = ''
    expect(await cli('upgrades', 'auto', 'on', '--window', 'Sat 22:00-23:00')).toBe(0)
    expect(flat(out)).toContain('Saturday 22:00–23:00')
  })

  it('refuses a window it cannot read, and changes nothing', async () => {
    expect(await cli('upgrades', '--window', 'whenever')).toBe(1)
    expect(flat(err)).toContain('Not a window this reads')
  })
})

describe('the owner socket @SC-847', () => {
  it('rebuilds the upgrade requests field by field', () => {
    expect(parseOwnerRequest({ op: 'upgrades.check', target: 'hq', version: '0.2.1', extra: 'x' })).toEqual({ ok: true, request: { op: 'upgrades.check', target: 'hq', version: '0.2.1' } })
    expect(parseOwnerRequest({ op: 'upgrades.check', target: 'hq', version: 'latest' })).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
    expect(parseOwnerRequest({ op: 'upgrades.set', auto: 'yes' })).toMatchObject({ ok: false })
    expect(parseOwnerRequest({ op: 'upgrades.set' })).toMatchObject({ ok: false })
  })
})

describe('agenthix status, when an upgrade is ready @SC-836', () => {
  const status = (ready: UpgradesStatus['ready'], over: Partial<UpgradesStatus> = {}): UpgradesStatus => ({
    auto: true, window: 'Sunday 02:00–04:00', target: 'hq', current: '0.2.0', ready, hostService: null, launcher: true, hostSwitchFailed: null,
    problem: null, checkedAt: null, rolledBackLately: null, ...over,
  })
  const fix = { version: '0.2.1', fix: true, hostServiceFirst: false, rolledBack: false, scheduledAt: null }

  it('says a fix applies by itself in the window, and how to apply it sooner', () => {
    expect(flat(upgradeLines(status(fix), 'hq').join('\n')).trim()).toBe(
      'Upgrade ready: 0.2.1, a fix. It applies by itself in the maintenance window, Sunday 02:00–04:00, after a backup. To apply it sooner: agenthix hq upgrade')
  })

  it('says a new version applies only when asked for', () => {
    expect(flat(upgradeLines(status({ ...fix, version: '0.3.0', fix: false }), 'hq').join('\n'))).toContain('0.3.0, a new version, which applies only when asked for')
  })

  it('says a fix that rolled back is not applied by itself again', () => {
    expect(flat(upgradeLines(status({ ...fix, rolledBack: true }), 'hq').join('\n'))).toContain('agenthix hq upgrade 0.2.1')
  })

  it('says nothing while nothing is ready, and nothing under the other block', () => {
    expect(upgradeLines(status(null), 'hq')).toEqual([])
    expect(upgradeLines(status(fix), 'site')).toEqual([])
  })

  it('is part of agenthix status', async () => {
    publish(['0.2.0', '0.2.1'])
    await cli('upgrades', 'auto', 'on')
    await cli('upgrades', 'auto', 'off')
    out = ''
    expect(await cli('status')).toBe(0)
    expect(flat(out)).toContain('Upgrade ready: 0.2.1, a fix. Automatic fixes are off. To apply it: agenthix hq upgrade')
  })
})
