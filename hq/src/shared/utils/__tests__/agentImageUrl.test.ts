import { describe, expect, it, vi } from 'vitest'

const asked = vi.hoisted(() => [] as Record<string, string>[])
vi.mock('wasp/client/api', () => ({
  api: {
    get: (_route: string, { searchParams }: { searchParams: Record<string, string> }) => {
      asked.push(searchParams)
      const which = searchParams.size === 'small' ? 'small' : 'full'
      return { json: async () => ({ url: `https://files.example.com/t/${which}`, expiresAt: new Date(Date.now() + 3_600_000).toISOString() }) }
    },
  },
}))

import { resolveAgentImageUrl } from '../agentImageUrl'

describe("a picture's link", () => {
  it('is to the small copy unless the full picture is asked for, each size cached apart', async () => {
    expect(await resolveAgentImageUrl('/agents/a1/images/x.webp')).toBe('https://files.example.com/t/small')
    expect(await resolveAgentImageUrl('/agents/a1/images/x.webp', 'full')).toBe('https://files.example.com/t/full')
    expect(await resolveAgentImageUrl('/agents/a1/images/x.webp', 'small')).toBe('https://files.example.com/t/small')
    expect(asked).toEqual([
      { path: '/agents/a1/images/x.webp', size: 'small' },
      { path: '/agents/a1/images/x.webp' },
    ])
  })
})
