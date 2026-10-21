import { describe, it, expect } from 'vitest'
import { refuseSignup } from '../refuseSignup'

type Params = Parameters<typeof refuseSignup>[0]

const params = (username: string): Params =>
  ({
    req: { body: { username, password: 'a-long-password' } },
    providerId: { providerName: 'username', providerUserId: username },
    prisma: {},
  }) as unknown as Params

describe('refuseSignup (R-194)', () => {
  it.each(['alice', 'admin', ''])('refuses a framework sign-up for %j with 403', async (username) => {
    await expect(refuseSignup(params(username))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('says sign-up is by invitation', async () => {
    await expect(refuseSignup(params('alice'))).rejects.toThrow(/invitation/i)
  })
})
