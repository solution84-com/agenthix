import { describe, it, expect } from 'vitest'
import { envProblems } from '../envValidation'

const goodKey = Buffer.alloc(32, 9).toString('base64')
const good: NodeJS.ProcessEnv = { SECRETS_MASTER_KEY: goodKey }

describe('envProblems (R-200)', () => {
  it('reports nothing for a complete environment', () => {
    expect(envProblems(good)).toEqual([])
  })

  it('requires SECRETS_MASTER_KEY, naming it and how to generate it', () => {
    const problems = envProblems({})
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('SECRETS_MASTER_KEY')
    expect(problems[0]).toContain('openssl rand -base64 32')
  })

  it('treats an empty SECRETS_MASTER_KEY as missing', () => {
    expect(envProblems({ ...good, SECRETS_MASTER_KEY: '' })).toHaveLength(1)
  })

  it('refuses a SECRETS_MASTER_KEY that is not 32 bytes', () => {
    const problems = envProblems({ ...good, SECRETS_MASTER_KEY: Buffer.alloc(10).toString('base64') })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('32 bytes')
  })

  it('needs no first-admin key: the first admin gets a one-time link instead @SC-708', () => {
    expect(envProblems(good).join('\n')).not.toContain('SITE_ADMIN_KEY')
  })

  it('reports every missing setting together', () => {
    expect(envProblems({ NODE_ENV: 'production' })).toHaveLength(3)
  })

  it('requires DATABASE_URL and HQ_STORAGE_ROOT in production only', () => {
    expect(envProblems(good)).toEqual([])
    const problems = envProblems({ ...good, NODE_ENV: 'production' })
    expect(problems.join('\n')).toContain('DATABASE_URL')
    expect(problems.join('\n')).toContain('HQ_STORAGE_ROOT')
  })

  it('reports an invalid HQ_TRUSTED_PROXIES', () => {
    expect(envProblems({ ...good, HQ_TRUSTED_PROXIES: 'many' }).join('\n')).toContain('HQ_TRUSTED_PROXIES')
  })
})
