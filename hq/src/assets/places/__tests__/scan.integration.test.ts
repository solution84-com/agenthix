import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../../test/db'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})

import { recordScan } from '../scan'

const place = { placeType: 'project' as const, placeId: 'p1' }
const found = (path: string, fingerprint: string, extra: object = {}) =>
  ({ group: 'place' as const, path, fingerprint, name: path, description: '', ...extra })

describe('recording what a scan of a place found', () => {
  it('keeps one row per folder, updating its fingerprint, and marks a folder no longer found as gone', async () => {
    await recordScan(place, { skills: [found('a', '1'.repeat(64)), found('b', '2'.repeat(64))], problems: [], truncated: false })
    const rows = await recordScan(place, { skills: [found('a', '3'.repeat(64))], problems: [], truncated: false })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ path: '.agents/skills/a', lastFingerprint: '3'.repeat(64), goneAt: null })
    const b = await prisma.placeSkill.findFirstOrThrow({ where: { ...place, path: '.agents/skills/b' } })
    expect(b.goneAt).not.toBeNull()
  })

  it('marks nothing gone when the scan was cut short by a bound', async () => {
    await recordScan(place, { skills: [found('a', '1'.repeat(64))], problems: [], truncated: false })
    await recordScan(place, { skills: [], problems: [], truncated: true })
    const a = await prisma.placeSkill.findFirstOrThrow({ where: { ...place, path: '.agents/skills/a' } })
    expect(a.goneAt).toBeNull()
  })

  it("marks gone only under the roots it scanned: another agent's and an unscanned workspace's skills stay", async () => {
    await recordScan(place, {
      skills: [
        found('a', '1'.repeat(64)),
        found('mine', '2'.repeat(64), { group: 'agent', agentId: 'ada' }),
        found('theirs', '3'.repeat(64), { group: 'agent', agentId: 'bob' }),
        found('repo', '4'.repeat(64), { group: 'workspace', workspaceId: 'w1', workspaceFolder: '.claude/skills' }),
      ],
      problems: [], truncated: false,
    }, { agentId: 'ada', workspaceIds: ['w1', 'w2'] })
    await recordScan(place, { skills: [], problems: [], truncated: false }, { agentId: 'ada', workspaceIds: ['w2'] })
    const gone = await prisma.placeSkill.findMany({ where: { ...place, goneAt: { not: null } }, orderBy: { path: 'asc' } })
    expect(gone.map(r => r.path)).toEqual(['.agents/agents/ada/skills/mine', '.agents/skills/a'])
  })

  it('records no row for a finding whose path or workspace folder is unsafe', async () => {
    const rows = await recordScan(place, {
      skills: [
        found('../escape', '1'.repeat(64)),
        found('repo', '2'.repeat(64), { group: 'workspace', workspaceId: 'w1', workspaceFolder: 'src' }),
        found('ok', '3'.repeat(64)),
      ],
      problems: [], truncated: false,
    }, { agentId: null, workspaceIds: ['w1'] })
    expect(rows.map(r => r.path)).toEqual(['.agents/skills/ok'])
    expect(await prisma.placeSkill.count({ where: place })).toBe(1)
  })

  it('keeps a switch on its row; a new fingerprint does not move it', async () => {
    const [row] = await recordScan(place, { skills: [found('a', '1'.repeat(64))], problems: [], truncated: false })
    await prisma.placeSkill.update({ where: { id: row.id }, data: { switch: 'ON', switchFingerprint: '1'.repeat(64) } })
    const [after] = await recordScan(place, { skills: [found('a', '2'.repeat(64))], problems: [], truncated: false })
    expect(after).toMatchObject({ switch: 'ON', switchFingerprint: '1'.repeat(64), lastFingerprint: '2'.repeat(64) })
  })
})
