import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {} }))
vi.mock('../../../storage/repoWorkStore', () => ({ repoStateOnSite: vi.fn() }))

import { builtInSkillsFor, locationIsRepository } from '../delivery'
import { repoStateOnSite } from '../../../storage/repoWorkStore'
import { settleStagedNames, stagedNameOf, type NamedItem } from '../../delivery/stagedNames'
import type { Db } from '../../../packages/packageStore'

const D = 'd'.repeat(64)
type Row = { name: string; currentVersion: { id: string; version: string; digest: string } | null }
const row = (name: string): Row => ({ name, currentVersion: { id: `v-${name}`, version: '2.0.0', digest: D } })

function dbWith(rows: Row[]) {
  const findMany = vi.fn(async () => rows)
  return { db: { asset: { findMany } } as unknown as Db, findMany }
}

describe('the built-in skills a run is given', () => {
  it('asks only for built-ins that are on, not removed, and published by Agenthix', async () => {
    const { db, findMany } = dbWith([])
    await builtInSkillsFor(db, async () => true)
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ kind: 'SKILL', builtIn: true, switchedOff: false, removedAt: null, publisher: 'agenthix' }),
    }))
  })

  it('each at the builtin level, with its content to deliver', async () => {
    const { db } = dbWith([row('skill-creator')])
    expect(await builtInSkillsFor(db, async () => false)).toEqual([{
      identity: 'agenthix/skill-creator', version: '2.0.0', digest: D, level: 'builtin', ref: { kind: 'skill', key: 'v-skill-creator', digest: D },
    }])
  })

  it('working-with-git only when the run works in a repository', async () => {
    const { db } = dbWith([row('skill-creator'), row('working-with-git')])
    expect((await builtInSkillsFor(db, async () => true)).map(e => e.identity)).toEqual(['agenthix/skill-creator', 'agenthix/working-with-git'])
    expect((await builtInSkillsFor(db, async () => false)).map(e => e.identity)).toEqual(['agenthix/skill-creator'])
  })

  it('asks the site nothing when no built-in depends on a repository', async () => {
    const { db } = dbWith([row('skill-creator')])
    const inRepository = vi.fn(async () => true)
    await builtInSkillsFor(db, inRepository)
    expect(inRepository).not.toHaveBeenCalled()
  })

  it('none before its first version', async () => {
    const { db } = dbWith([{ name: 'skill-creator', currentVersion: null }])
    expect(await builtInSkillsFor(db, async () => true)).toEqual([])
  })

  it('stage as platform-<name> and pass the staged-name check beside installed skills of the same name', async () => {
    const { db } = dbWith([row('skill-creator'), row('working-with-git')])
    const builtIns = await builtInSkillsFor(db, async () => true)
    const items: NamedItem[] = builtIns.map(entry => ({ kind: 'installed', entry }))
    expect(items.map(stagedNameOf)).toEqual(['platform-skill-creator', 'platform-working-with-git'])
    const orgOwn: NamedItem = { kind: 'installed', entry: { identity: 'acme/working-with-git', version: '1.0.0', digest: D, level: 'org' } }
    const all = [...items, orgOwn].map(item => ({ level: 'installed' as const, key: JSON.stringify(item.entry), label: '', item }))
    expect(settleStagedNames(all).setAside).toEqual([])
  })
})

describe('whether the run works in a repository', () => {
  const loc = { ownerType: 'project' as const, ownerId: 'p1', workspaceId: 'w1' }

  it('is what the site holding the location says', async () => {
    vi.mocked(repoStateOnSite).mockResolvedValueOnce({ isGitRepo: true, hasFiles: true })
    expect(await locationIsRepository('site-1', loc)()).toBe(true)
    expect(repoStateOnSite).toHaveBeenLastCalledWith('site-1', loc)
    vi.mocked(repoStateOnSite).mockResolvedValueOnce({ isGitRepo: false, hasFiles: true })
    expect(await locationIsRepository('site-1', loc)()).toBe(false)
  })

  it('is no when the site can\'t say, so the run goes on without it', async () => {
    vi.mocked(repoStateOnSite).mockRejectedValueOnce(new Error('offline'))
    expect(await locationIsRepository('site-1', loc)()).toBe(false)
  })
})
