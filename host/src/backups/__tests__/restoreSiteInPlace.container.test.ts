/**
 * A site restored to an earlier night on its own machine, against a real Docker (`npm run test:container` with
 * HOST_E2E=1), through the request the Fleet Console's Restore… sends: `backup.restore` with `from: 'machine'`.
 *
 * Build the host service's image first, at the repository root: `docker build -f host/docker/Dockerfile -t
 * agenthix-host .` (or name another with HOST_IMAGE); the site-server, agent and executor images of a development build must be
 * on the machine. It needs no port and no other part of an install: it can run beside a real install. Everything it
 * makes carries a namespace of its own for the run, the host service's container being `<namespace>-host`; every
 * docker command goes through the guard (`containerGuard.ts`), and teardown removes only that namespace's.
 *
 * The site is written and started as a Fleet Console's `install` does, with an HQ address nothing answers at: joining
 * it to a real HQ takes a second host service, which one Docker cannot run beside the first.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testNamespace } from '../../__tests__/containerGuard'
import { Machine, type Listed } from './inPlace'

const words = (s: string) => s.replace(/\s+/g, ' ')
const NOTES = 'site/data/workspaces/c4-probe/notes.txt'
const LATER = 'site/data/workspaces/c4-probe/later.txt'

describe.skipIf(!process.env.HOST_E2E)('a site restored to an earlier night on its own machine', () => {
  let m: Machine
  let earlierSite: string
  const probe = () => m.psql('site-db', 'select body from c4_probe')
  const kept = () => ({
    settings: m.file('site/settings.json'), credential: m.file('site/credential.json'),
    secrets: m.file('secrets.json'), compose: m.file('site/compose.json'),
  })

  beforeAll(async () => {
    m = new Machine(testNamespace('sitein'), 'c4-office')
    await m.start()
    // An earlier site on this machine, backed up, then erased; the site there now was installed after it.
    m.seedSite('2026-10-01T09:00:00.000Z')
    await m.siteReady()
    earlierSite = m.takeBackup()
    m.removeSite()
    m.seedSite('2026-10-10T09:00:00.000Z')
    await m.siteReady()
  }, 10 * 60_000)

  afterAll(() => m?.cleanUp(), 5 * 60_000)

  it('brings back the database and the workspaces as at the night, as the same site, after backing up what was there', async () => {
    m.psql('site-db', "create table c4_probe (body text); insert into c4_probe values ('night A')")
    m.write(NOTES, 'night A\n')
    const nightA = m.takeBackup()

    m.psql('site-db', "update c4_probe set body = 'after A'")
    m.write(NOTES, 'after A\n')
    m.write(LATER, 'written after A\n')
    const before = kept()
    const listedBefore = m.backups()
    expect(listedBefore.map(b => b.id)).toContain(nightA)

    expect(m.restore('site', nightA)).toMatchObject({ ok: true })

    expect(probe()).toBe('night A')
    expect(m.file(NOTES)).toBe('night A\n')
    expect(m.file(LATER)).toBeNull()
    // The same site: its name, settings, credential and secrets as they were.
    expect(kept()).toEqual(before)
    expect(JSON.parse(m.file('site/settings.json')!)).toMatchObject({ name: 'c4-office', installedAt: '2026-10-10T09:00:00.000Z' })
    expect(JSON.parse(m.file('site/data/restored.json')!)).toMatchObject({ night: expect.any(String), takenAt: expect.any(String) })
    // It starts again on its data folder, which keeps the site's own ownership through the restore.
    await m.siteReady()

    // What was there was backed up first, and restoring that backup brings it back.
    const taken = m.backups().filter(b => !listedBefore.some(l => l.id === b.id))
    expect(taken.map(b => b.kind)).toEqual(['beforeRestore'])
    expect(m.restore('site', (taken[0] as Listed).id)).toMatchObject({ ok: true })
    expect(probe()).toBe('after A')
    expect(m.file(NOTES)).toBe('after A\n')
    expect(m.file(LATER)).toBe('written after A\n')
    expect(kept()).toEqual(before)
    await m.siteReady()
  }, 15 * 60_000)

  it('refuses in words a backup of the site that ran here before, and changes nothing', () => {
    const listed = m.backups()
    expect(listed.map(b => b.id)).toContain(earlierSite)
    const before = { ...kept(), row: probe(), file: m.file(NOTES) }

    const answer = m.restore('site', earlierSite)
    expect(answer.ok).toBe(false)
    if (answer.ok) return
    expect(answer.refusal.code).toBe('conflict')
    expect(words(answer.refusal.message)).toMatch(/is of a site that ran on c4-office before the one there now, so it is not restored over it\. Nothing was changed\./)

    expect({ ...kept(), row: probe(), file: m.file(NOTES) }).toEqual(before)
    expect(m.backups().map(b => b.id)).toEqual(listed.map(b => b.id))
    expect(m.running(m.names.siteContainer)).toBe(true)
  }, 5 * 60_000)
})
