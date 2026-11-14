import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { installed } from '../../service/context'
import { BackupStore } from '../../backups/store'
import { upgrade } from '../upgrade'
import { readUpgrades } from '../settings'
import { upgradePartway } from '../status'
import { parseOwnerRequest } from '../../owner/requests'
import { parseCommand } from '../../cli/commands'
import { partwayLines } from '../../cli/partwayText'
import '../operations'

const PARTS = ['hq-server', 'hq-web', 'relay', 'site-server', 'agent', 'executor', 'console'] as const
let m: FakeMachine
let log: string[]
let next = 1

/** Images built here under `tag`, each with an id of its own, as `docker image inspect` reads them. */
function built(tag: string): Record<string, string> {
  const ids: Record<string, string> = {}
  for (const part of PARTS) {
    const id = `sha256:${String(next++).padStart(64, '0')}`
    m.containers.images.set(id, { id, env: [], repoDigests: [] })
    m.containers.refs.set(`agenthix-${part}:${tag}`, id)
    ids[part] = id
  }
  return ids
}

const actions = () => m.calls.filter(c => c[0] === 'compose' || c[0] === 'pull').map(c => (c[0] === 'pull' ? 'pull' : c.includes('stop') ? 'stop' : c.includes('up') ? 'up' : 'compose'))
const hqImages = () => installed(m.ctx).hq!.settings.images

beforeEach(async () => {
  m = fakeMachine()
  m.ctx.machine.hostServiceVersion = 'dev'
  log = []
  m.ctx.log = line => log.push(line)
  built('from')
  await install(m.ctx, { address: 'http://127.0.0.1:7820', hqPort: 7820, consolePort: 7821, imageTag: 'from' }, () => {})
  m.calls.length = 0
  m.checked.length = 0
})
afterEach(() => m.cleanup())

describe('a development build installs the images built here under a tag', () => {
  it('runs each as <image name>:<tag>, with no signature checked or image fetched', () => {
    expect(hqImages()).toEqual({ 'hq-server': 'agenthix-hq-server:from', 'hq-web': 'agenthix-hq-web:from', relay: 'agenthix-relay:from' })
    expect(installed(m.ctx).site!.settings.images).toMatchObject({ 'site-server': 'agenthix-site-server:from', executor: 'agenthix-executor:from' })
    expect(fs.readFileSync(m.ctx.state.path('hq', 'compose.json'), 'utf8')).toContain('"image": "agenthix-hq-web:from"')
  })

  it('is refused on a published host service, and when an image is not on the machine', async () => {
    const other = fakeMachine()
    try {
      await expect(install(other.ctx, { address: 'http://127.0.0.1:7820', imageTag: 'from' }, () => {})).rejects.toThrow('a published version: it installs only its own published, signed images')
      other.ctx.machine.hostServiceVersion = 'dev'
      await expect(install(other.ctx, { address: 'http://127.0.0.1:7820', imageTag: 'nothing' }, () => {})).rejects.toThrow('The image agenthix-hq-server:nothing is not on this machine.')
    } finally {
      other.cleanup()
    }
  })
})

describe('a development build upgrades to the images built here under a tag', () => {
  it('takes the published path — backup, stop, the new projects, start, a health check of the new containers — without a signature or a fetch', async () => {
    const ids = built('next')
    const steps: string[] = []
    const outcome = await upgrade(m.ctx, 'hq', 'dev', p => { if (p.event === 'step') steps.push(p.step) }, { built: 'next' })
    expect(outcome).toEqual({ version: 'dev', rolledBack: false })
    expect(steps).toEqual([
      'Finding the images tagged next on this machine', 'Stopping HQ and its site', 'Taking a sealed backup', 'Starting the images tagged next', 'Health check',
    ])
    expect(m.checked).toEqual([])
    expect(actions()).not.toContain('pull')
    expect(hqImages()).toEqual({ 'hq-server': 'agenthix-hq-server:next', 'hq-web': 'agenthix-hq-web:next', relay: 'agenthix-relay:next' })
    expect(installed(m.ctx).site!.settings.images!['site-server']).toBe('agenthix-site-server:next')
    expect(await new BackupStore(m.ctx.state).list()).toHaveLength(1)
    expect(readUpgrades(m.ctx.state)).toMatchObject({ underWay: null, rolledBack: [], last: { to: 'the images tagged next', rolledBack: false } })
    expect(log).toContain('Upgrade of HQ to the images tagged next: Health check: passes.')
    expect(ids['hq-server']).toMatch(/^sha256:/)
  })

  it('puts back the images it ran before, from the backup, when the new ones do not come up healthy', async () => {
    built('broken')
    m.backups.databases.set('agenthix_hq', Buffer.from('rows before'))
    m.ctx.hqControl.status = async () => {
      m.backups.databases.set('agenthix_hq', Buffer.from('changed by the new build'))
      return null
    }
    const outcome = await upgrade(m.ctx, 'hq', 'dev', () => {}, { built: 'broken' })
    expect(outcome.rolledBack && outcome.reason).toMatch(/^HQ did not pass its health check: hq-server did not answer from the new image within 1 minute\. The host service restored the backup from \d\d:\d\d, and HQ runs the images it ran before again\.$/)
    expect(m.backups.databases.get('agenthix_hq')!.toString()).toBe('rows before')
    expect(hqImages()!['hq-server']).toBe('agenthix-hq-server:from')
    expect(m.up.has('agenthix-hq') && m.up.has('agenthix-site')).toBe(true)
    expect(readUpgrades(m.ctx.state).rolledBack).toEqual([])
  })

  it('never counts a container still running the old image, though it answers', async () => {
    const from = m.containers.refs.get('agenthix-hq-server:from')!
    built('next')
    m.ctx.docker.containerImage = async () => from
    const outcome = await upgrade(m.ctx, 'hq', 'dev', () => {}, { built: 'next' })
    expect(outcome.rolledBack && outcome.reason).toContain('hq-server did not answer from the new image')
  })

  it('is refused before anything stops when an image is not on the machine', async () => {
    await expect(upgrade(m.ctx, 'hq', 'dev', () => {}, { built: 'missing' })).rejects.toThrow(
      'The image agenthix-hq-server:missing is not on this machine. Build it, or tag one, as agenthix-hq-server:missing, then run this again. Nothing was changed.')
    expect(actions()).toEqual([])
  })

  it('is refused by a published host service', async () => {
    m.ctx.machine.hostServiceVersion = '0.2.0'
    await expect(upgrade(m.ctx, 'hq', 'dev', () => {}, { built: 'next' })).rejects.toThrow('a published version: it upgrades only to published versions')
  })

  it('says the command that finishes or puts back one left part-way', async () => {
    built('next')
    m.ctx.hqControl.status = async () => null
    m.ctx.backupIO.restoreDatabase = async () => { throw new Error('the database would not take the rows') }
    await expect(upgrade(m.ctx, 'hq', 'dev', () => {}, { built: 'next' })).rejects.toThrow('to try again now: agenthix hq upgrade --image-tag next')
    const p = upgradePartway(m.ctx)
    expect(p).toMatchObject({ to: 'dev', built: 'next' })
    expect(partwayLines(p, m.ctx.now()).join(' ').replace(/\s+/g, ' ')).toContain('The upgrade to the images tagged next, from the images it ran before, ended part-way.')
  })
})

describe('asking for it', () => {
  it('is hq upgrade --image-tag <tag> and install --image-tag <tag>, and the owner socket rebuilds it field by field', () => {
    expect(parseCommand(['hq', 'upgrade', '--image-tag', 'next', '--yes'])).toEqual({ kind: 'upgradeBuilt', target: 'hq', tag: 'next', yes: true })
    expect(parseCommand(['site', 'upgrade', '--image-tag', 'next'])).toEqual({ kind: 'upgradeBuilt', target: 'site', tag: 'next', yes: false })
    expect(parseCommand(['hq', 'upgrade', '--image-tag', 'no/slash'])).toMatchObject({ kind: 'usage' })
    expect(parseCommand(['hq', 'upgrade', '0.2.1', '--image-tag', 'next'])).toMatchObject({ kind: 'usage' })
    expect(parseCommand(['install', '--address', 'http://127.0.0.1:7820', '--image-tag', 'from', '--yes'])).toMatchObject({ kind: 'install', imageTag: 'from' })
    expect(parseOwnerRequest({ op: 'upgrades.built', target: 'hq', tag: 'next', extra: 1 })).toEqual({ ok: true, request: { op: 'upgrades.built', target: 'hq', tag: 'next' } })
    expect(parseOwnerRequest({ op: 'upgrades.built', target: 'hq', tag: '--rm' })).toMatchObject({ ok: false })
    expect(parseOwnerRequest({ op: 'machine.install', address: 'http://127.0.0.1:7820', imageTag: 'a b' })).toMatchObject({ ok: false })
  })
})
