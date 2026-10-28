import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMarketplace } from '../operations'

const as = { user: { id: 'u1' } }

/*
 * The Marketplace is behind a flag that is on only in development (adr-0116). Hiding its button is not enough: its
 * server route must refuse where the flag is off (security review L2). The flag is read on each call, from NODE_ENV.
 */
describe("the Marketplace's server route @security-L2 @SC-1631", () => {
  afterEach(() => { vi.unstubAllEnvs() })

  it('refuses in production, whoever asks', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    await expect(getMarketplace({}, as)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('answers in development, and only to someone signed in', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    await expect(getMarketplace({}, as)).resolves.toEqual({ available: false })
    await expect(getMarketplace({}, {})).rejects.toMatchObject({ statusCode: 401 })
  })
})
