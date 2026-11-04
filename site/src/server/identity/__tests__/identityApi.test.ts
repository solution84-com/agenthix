import { describe, it, expect, vi, beforeEach } from 'vitest'
import { errors } from 'jose'

const verify = vi.hoisted(() => vi.fn())
vi.mock('../verifyHqToken', () => ({ verifyHqToken: verify }))

import { whoamiHandler } from '../identityApi'

function call(authorization?: string) {
  const res = { status: vi.fn(), json: vi.fn() }
  res.status.mockReturnValue(res)
  res.json.mockReturnValue(res)
  return Promise.resolve(whoamiHandler({ headers: { authorization } } as any, res as any)).then(() => res)
}

beforeEach(() => vi.clearAllMocks())

describe('whoami', () => {
  it('answers with the verified identity', async () => {
    verify.mockResolvedValue({ sub: 'u1', tokenType: 'identity', role: 'ADMIN' })
    const res = await call('Bearer t')
    expect(res.json).toHaveBeenCalledWith({ userId: 'u1', tokenType: 'identity', role: 'ADMIN' })
  })

  it('answers 401 for a token hq\'s keys refuse', async () => {
    verify.mockRejectedValue(new errors.JWSSignatureVerificationFailed())
    expect((await call('Bearer t')).status).toHaveBeenCalledWith(401)
  })

  it('answers 503, not 401, when hq\'s key set could not be fetched', async () => {
    verify.mockRejectedValue(new errors.JWKSTimeout())
    expect((await call('Bearer t')).status).toHaveBeenCalledWith(503)
    verify.mockRejectedValue(new TypeError('fetch failed'))
    expect((await call('Bearer t')).status).toHaveBeenCalledWith(503)
  })
})
