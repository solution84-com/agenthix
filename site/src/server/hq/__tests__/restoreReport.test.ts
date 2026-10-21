import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const h = vi.hoisted(() => ({ workspaces: [] as unknown[] }))
vi.mock('#db', () => ({ prisma: { workspace: { findMany: async () => h.workspaces } } }))

import { readRestoredNote, restoreReport, RESTORED_NOTE } from '../restoreReport'
import { channelMethods } from '../channelMethods'

let dir: string
const before = process.env.SITE_ROOT
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'site-restored-'))
  process.env.SITE_ROOT = dir
})
afterEach(async () => {
  process.env.SITE_ROOT = before
  await fs.rm(dir, { recursive: true, force: true })
})

describe('site.restoreReport', () => {
  it('says the site was never restored when there is no note', async () => {
    h.workspaces = [{ id: 'w1', ownerType: 'project', ownerId: 'p1' }]
    expect(await restoreReport()).toEqual({ restored: null, workspaces: [{ id: 'w1', ownerType: 'project', ownerId: 'p1' }] })
  })

  it('names the backup the host service restored it from', async () => {
    await fs.writeFile(path.join(dir, RESTORED_NOTE), JSON.stringify({ night: '2026-10-12', takenAt: '2026-10-13T02:00:00.000Z' }))
    expect(await readRestoredNote(dir)).toEqual({ night: '2026-10-12', takenAt: '2026-10-13T02:00:00.000Z' })
  })

  it('ignores a note it cannot read', async () => {
    await fs.writeFile(path.join(dir, RESTORED_NOTE), '{not json')
    expect(await readRestoredNote(dir)).toBeNull()
    await fs.writeFile(path.join(dir, RESTORED_NOTE), JSON.stringify({ night: 'yesterday' }))
    expect(await readRestoredNote(dir)).toBeNull()
  })

  it('is one of the methods hq may ask', () => {
    expect(channelMethods['site.restoreReport']).toBeTypeOf('function')
  })
})
