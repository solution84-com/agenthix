import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The sweep keeps content anything still names (skills spec, data board: Retention; V6, D26). Read from the schema's
// text so a record added later that names content and is left out of the sweep fails here, not in production.

vi.mock('wasp/server', () => ({ prisma: {} }))

import { CONTENT_HOLDERS, unreferencedContentWhere, PACKAGE_CONTENT_GRACE_MS } from '../packageContentSweep'

const schema = readFileSync(join(__dirname, '../../../schema.prisma'), 'utf8')

function packageContentListFields(): string[] {
  const body = /\nmodel PackageContent \{([\s\S]*?)\n\}/.exec(schema)?.[1]
  if (!body) throw new Error('model PackageContent not found in schema.prisma')
  return [...body.matchAll(/^\s+(\w+)\s+\w+\[\]/gm)].map(m => m[1])
}

describe('package content sweep: what keeps content', () => {
  it('names every record that refers to content, besides the content\'s own files', () => {
    const holders = packageContentListFields().filter(f => f !== 'files')
    expect([...CONTENT_HOLDERS].sort()).toEqual(holders.sort())
  })

  it('keeps content any asset version, draft, draft revision, proposal or place skill version names', () => {
    expect(CONTENT_HOLDERS).toEqual(expect.arrayContaining([
      'packages', 'assetVersions', 'drafts', 'draftRevisions', 'proposals', 'placeSkillVersions',
    ]))
  })

  it('removes only content no holder names, released or never pointed at before the grace period', () => {
    const now = new Date('2026-10-27T12:00:00Z')
    const cutoff = new Date(now.getTime() - PACKAGE_CONTENT_GRACE_MS)
    const where = unreferencedContentWhere(now)
    for (const holder of CONTENT_HOLDERS) expect(where[holder]).toEqual({ none: {} })
    expect(where.OR).toEqual([{ releasedAt: { lt: cutoff } }, { releasedAt: null, createdAt: { lt: cutoff } }])
  })
})
