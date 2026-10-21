import { describe, it, expect, afterEach } from 'vitest'
import { requireSecretsKey } from '../requireSecretsKey'
import { masterKeyProblem } from '../secretCrypto'

const original = process.env.SECRETS_MASTER_KEY
afterEach(() => {
  if (original === undefined) delete process.env.SECRETS_MASTER_KEY
  else process.env.SECRETS_MASTER_KEY = original
})

describe('masterKeyProblem (R-200)', () => {
  it('is null for a 32-byte base64 key', () => {
    expect(masterKeyProblem(Buffer.alloc(32, 1).toString('base64'))).toBeNull()
  })

  it('names the setting when it is missing or empty', () => {
    expect(masterKeyProblem(undefined)).toContain('SECRETS_MASTER_KEY')
    expect(masterKeyProblem('')).toContain('SECRETS_MASTER_KEY')
  })

  it('refuses a key of the wrong length', () => {
    expect(masterKeyProblem(Buffer.alloc(16, 1).toString('base64'))).toContain('32 bytes')
  })
})

function thrownBy(fn: () => void): { statusCode?: number; message?: string } {
  try {
    fn()
  } catch (err) {
    return err as { statusCode?: number; message?: string }
  }
  return {}
}

describe('requireSecretsKey (R-200)', () => {
  it('passes when the key is usable', () => {
    process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 3).toString('base64')
    expect(() => requireSecretsKey('Signing in with Claude')).not.toThrow()
  })

  it('throws an HTTP 503 with readable text naming what was attempted and how to fix it', () => {
    delete process.env.SECRETS_MASTER_KEY
    const err = thrownBy(() => requireSecretsKey('Signing in with Claude'))
    expect(err.statusCode).toBe(503)
    expect(err.message).toMatch(/Signing in with Claude.*SECRETS_MASTER_KEY.*openssl rand -base64 32/s)
  })

  it('throws for a key of the wrong length', () => {
    process.env.SECRETS_MASTER_KEY = Buffer.alloc(8, 3).toString('base64')
    expect(thrownBy(() => requireSecretsKey('Setting a model credential')).statusCode).toBe(503)
  })
})
