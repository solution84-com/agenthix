import { describe, expect, it, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {} }))
vi.mock('../../cloud', () => ({ cloudConnection: () => null }))
vi.mock('../registrationService', () => ({ authenticateSite: vi.fn() }))

import { cloudAiTokenAnswer } from '../cloudAiTokenApi'

describe("a site's request for hq's Agenthix Cloud token", () => {
  it('is refused as not connected while hq has no Cloud connection', async () => {
    expect(await cloudAiTokenAnswer({ connected: async () => false })).toEqual({ error: 'not_connected' })
  })

  it("is refused as not available while hq's calls to Cloud's AI do not exist yet", async () => {
    expect(await cloudAiTokenAnswer({ connected: async () => true })).toEqual({ error: 'not_available' })
  })
})
