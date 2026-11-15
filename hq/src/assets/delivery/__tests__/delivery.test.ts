import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {} }))
vi.mock('../../../sites/channel', () => ({ siteChannelRegistry: {}, ChannelRequestFailed: class extends Error {} }))
vi.mock('../../../sites/content', () => ({ openContentStream: vi.fn(), ContentStreamFailed: class extends Error {} }))

import { skillRefsOf } from '../../../packages/packageDelivery'

const D1 = '1'.repeat(64)
const D2 = '2'.repeat(64)

describe('delivering installed and personal content @SC-1650', () => {
  it('names each version once, by digest', () => {
    const ref1 = { kind: 'skill' as const, key: 'v1', digest: D1 }
    const ref2 = { kind: 'skill' as const, key: 'v2', digest: D2 }
    const refs = skillRefsOf({
      installedSkills: [
        { identity: 'acme/a', version: '1.0.0', digest: D1, level: 'org', ref: ref1 },
        { identity: 'acme/b', version: '1.0.0', digest: D1, level: 'agent', ref: ref1 },
      ],
      personSkills: [{ identity: 'notes', version: '2', digest: D2, ref: ref2 }],
    })
    expect(refs).toEqual([ref1, ref2])
  })

  it('names nothing for a run without skills', () => {
    expect(skillRefsOf({})).toEqual([])
  })
})
