/**
 * HQ and its site restored to an earlier night on HQ's own machine, against a real Docker (`npm run test:container`
 * with HOST_E2E=1), through the request the Fleet Console's Restore… sends: `backup.restore`, target `hq`, with
 * `from: 'machine'`.
 *
 * Build the host service's image first, at the repository root: `docker build -f host/docker/Dockerfile -t
 * agenthix-host .` (or name another with HOST_IMAGE); the hq-server, hq-web, site-server, agent and console images of a
 * development build must be on the machine. It installs HQ at http://localhost:4130, so that port must be free, and a
 * machine runs one HQ, so there must be none on it already: it checks both before it starts anything and refuses,
 * touching nothing, when either does not hold. Everything it makes carries a namespace of its own for the run, the
 * host service's container being `<namespace>-host`; every docker command goes through the guard
 * (`containerGuard.ts`), and teardown removes only that namespace's.
 *
 * The Fleet Console beside HQ publishes 127.0.0.1:4300, which a development machine may hold already; Docker then
 * refuses that one port, so nothing there is touched. Install stops at that step with HQ and its site running, the
 * console's settings written and its container not started; the test goes on, and checks the console's state is
 * left as it was either way.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { requireFreePorts, requireNoHq, testNamespace } from '../../__tests__/containerGuard'
import { IMAGE, Machine } from './inPlace'

const HQ_PORT = 4130

const NOTES = 'site/data/workspaces/c4-probe/notes.txt'

describe.skipIf(!process.env.HOST_E2E)('HQ and its site restored to an earlier night on HQ’s machine', () => {
  let m: Machine
  let consoleRan: boolean
  const storage = () => m.names.hqStorageVolume
  const consoleVolume = () => m.names.consoleStateVolume
  const onVolume = (volume: string, script: string) =>
    m.docker('run', '--rm', '-v', `${volume}:/v`, '--entrypoint', 'sh', IMAGE, '-c', script)
  const storageFile = () => onVolume(storage(), 'cat /v/c4-probe.txt 2>/dev/null || echo none')
  const hqRow = () => m.psql('hq-db', 'select body from c4_probe')
  const siteRow = () => m.psql('site-db', 'select body from c4_probe')
  /** The Fleet Console's settings and keys, and whether it runs: all left as they are by a restore in place. */
  const fleetConsole = () => ({
    files: m.onState('cd /s/console 2>/dev/null && find . -type f | sort | xargs sha256sum || echo none'),
    state: m.docker('volume', 'ls', '-q', '--filter', `name=^${consoleVolume()}$`).trim()
      ? onVolume(consoleVolume(), 'cd /v && find . -type f | sort | xargs -r sha256sum')
      : 'no volume',
    running: m.running(m.names.consoleContainer),
  })
  const kept = () => ({
    hq: m.file('hq/settings.json'), site: m.file('site/settings.json'), secrets: m.file('secrets.json'),
  })

  beforeAll(async () => {
    await requireFreePorts([HQ_PORT])
    await requireNoHq()
    m = new Machine(testNamespace('hqin'), 'c4-hq')
    await m.start()
    const installed = m.cli('', 'install', '--address', `http://localhost:${HQ_PORT}`, '--yes')
    consoleRan = installed.code === 0
    if (!consoleRan) {
      // Only the Fleet Console's step may fail, when 127.0.0.1:4300 is held on this machine.
      expect(installed.text).toMatch(/Starting the site c4-hq \(private Docker network\) \.+ connected to HQ/)
      expect(installed.text).toMatch(/Starting the Fleet Console/)
      console.warn('The Fleet Console did not start (127.0.0.1:4300 is held here); HQ and its site run, and its state is still checked.')
    }
    await m.siteReady()
  }, 20 * 60_000)

  afterAll(() => m?.cleanUp(), 5 * 60_000)

  it('brings back HQ’s database and storage and the site’s, after backing up what was there, leaving the Fleet Console as it was', async () => {
    m.psql('hq-db', "create table c4_probe (body text); insert into c4_probe values ('night A')")
    m.psql('site-db', "create table c4_probe (body text); insert into c4_probe values ('night A')")
    onVolume(storage(), 'echo "night A" > /v/c4-probe.txt')
    m.write(NOTES, 'night A\n')
    const nightA = m.takeBackup()

    m.psql('hq-db', "update c4_probe set body = 'after A'")
    m.psql('site-db', "update c4_probe set body = 'after A'")
    onVolume(storage(), 'echo "after A" > /v/c4-probe.txt')
    m.write(NOTES, 'after A\n')
    const before = kept()
    const consoleBefore = fleetConsole()
    expect(consoleBefore.files).toContain('./settings.json')
    const listedBefore = m.backups()
    expect(listedBefore.find(b => b.id === nightA)).toMatchObject({ holds: ['hq', 'site'] })

    expect(m.restore('hq', nightA)).toMatchObject({ ok: true })

    expect(hqRow()).toBe('night A')
    expect(siteRow()).toBe('night A')
    expect(storageFile().trim()).toBe('night A')
    expect(m.file(NOTES)).toBe('night A\n')
    expect(kept()).toEqual(before)
    expect(fleetConsole()).toEqual(consoleBefore)
    const taken = m.backups().filter(b => !listedBefore.some(l => l.id === b.id))
    expect(taken.map(b => ({ kind: b.kind, holds: b.holds }))).toEqual([{ kind: 'beforeRestore', holds: ['hq', 'site'] }])

    expect(m.running(m.names.container('hq-server'))).toBe(true)
    expect(m.running(m.names.container('hq-web'))).toBe(true)
    await m.siteReady()
    expect(m.cli('', 'status').text).toMatch(/Running\./)
    expect(m.running(m.names.consoleContainer)).toBe(consoleRan)
  }, 20 * 60_000)

  it('refuses the site alone as a target on HQ’s machine, and changes nothing', () => {
    const night = m.backups()[0]!
    const before = { ...kept(), row: hqRow(), backups: m.backups().length }
    const answer = m.restore('site', night.id)
    expect(answer).toMatchObject({ ok: false, refusal: { code: 'conflict', message: 'c4-hq runs HQ: its site goes back with HQ, so choose HQ to restore it.' } })
    expect({ ...kept(), row: hqRow(), backups: m.backups().length }).toEqual(before)
  })
})
