import { describe, expect, it, vi } from 'vitest'
import { withFeature } from '@agenthix/core/testing'

vi.mock('wasp/server', async () => {
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { HttpError, prisma: { org: { findFirst: async () => ({ featureSwitches: {} }) } } }
})

import { getMarketplace } from '../operations'

const as = { user: { id: 'u1' } }

/*
 * The Marketplace is behind a flag at preview (adr-0172). Hiding its button is not enough: its server route must
 * refuse where the flag is off (security review L2). Tests run as shipped, so outside its group the flag is off.
 */
describe("the Marketplace's server route @security-L2 @SC-1631", () => {
  it('refuses as shipped, whoever asks', async () => {
    await expect(getMarketplace({}, as)).rejects.toMatchObject({ statusCode: 404 })
  })

  withFeature('marketplace', () => {
    it('answers with the feature on, and only to someone signed in', async () => {
      await expect(getMarketplace({}, as)).resolves.toEqual({ available: false })
      await expect(getMarketplace({}, {})).rejects.toMatchObject({ statusCode: 401 })
    })
  })
})
