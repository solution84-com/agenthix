import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {} }))

import { hqRelaySecret, NO_HQ_RELAY_MESSAGE } from '../hqRelay'

describe("hq's relay secret @SC-1524", () => {
  it('is taken at 32 characters or more, trimmed', () => {
    expect(hqRelaySecret({ HQ_RELAY_SECRET: ` ${'a'.repeat(32)} ` })).toBe('a'.repeat(32))
  })

  it('is absent when unset, blank or shorter than 32 characters', () => {
    expect(hqRelaySecret({})).toBeNull()
    expect(hqRelaySecret({ HQ_RELAY_SECRET: '   ' })).toBeNull()
    expect(hqRelaySecret({ HQ_RELAY_SECRET: 'a'.repeat(31) })).toBeNull()
  })

  it('says, when absent, that files cannot be opened and what to set', () => {
    expect(NO_HQ_RELAY_MESSAGE).toMatch(/Files can't be opened/)
    expect(NO_HQ_RELAY_MESSAGE).toMatch(/HQ_RELAY_SECRET/)
  })
})
