import { describe, it, expect, vi } from 'vitest'
import path from 'node:path'

vi.mock('wasp/server', () => ({ prisma: {} }))

import { listShelf } from '../imageShelf'

describe("Agenthix's shelf in hq's image", () => {
  it('offers the 17 trade skills, each with a suited-to hint, and no git guide (that is built in)', async () => {
    const saved = process.env.HQ_ASSETS_ROOT
    process.env.HQ_ASSETS_ROOT = path.resolve(__dirname, '../../../../assets')
    try {
      const shelf = await listShelf()
      expect(shelf).toHaveLength(17)
      expect(shelf.map(s => s.name)).not.toContain('dev-github-operations')
      for (const skill of shelf) expect(skill.suitedTo.length, skill.name).toBeGreaterThan(0)
    } finally {
      if (saved === undefined) delete process.env.HQ_ASSETS_ROOT
      else process.env.HQ_ASSETS_ROOT = saved
    }
  })
})
