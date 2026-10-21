import { describe, expect, it } from 'vitest'
import { validateEnv } from '../validateEnv'

const KEY = Buffer.alloc(32, 1).toString('base64')
const DB = 'postgresql://site:site@localhost:5432/agenthix_site'

describe('validateEnv', () => {
  it('refuses to start without SITE_ROOT', () => {
    expect(validateEnv({ DATABASE_URL: DB, SECRETS_MASTER_KEY: KEY })).toEqual([expect.stringMatching(/SITE_ROOT/)])
  })
  it('refuses to start without SECRETS_MASTER_KEY, saying how to make one', () => {
    expect(validateEnv({ DATABASE_URL: DB, SITE_ROOT: '/data/site' })).toEqual([expect.stringMatching(/SECRETS_MASTER_KEY.*openssl rand -base64 32/)])
  })
  it('refuses a SECRETS_MASTER_KEY that is not 32 bytes, without printing it', () => {
    const problems = validateEnv({ DATABASE_URL: DB, SITE_ROOT: '/data/site', SECRETS_MASTER_KEY: 'c2hvcnRrZXk=' })
    expect(problems).toEqual([expect.stringMatching(/32 bytes/)])
    expect(problems.join('\n')).not.toContain('c2hvcnRrZXk=')
  })
  it('refuses to start without DATABASE_URL', () => {
    expect(validateEnv({ SITE_ROOT: '/data/site', SECRETS_MASTER_KEY: KEY })).toEqual([expect.stringMatching(/DATABASE_URL/)])
  })
  it('refuses a DATABASE_URL that is not a postgresql:// address, without printing it', () => {
    const problems = validateEnv({ DATABASE_URL: 'mysql://u:hunter2@db/site', SITE_ROOT: '/data/site', SECRETS_MASTER_KEY: KEY })
    expect(problems).toEqual([expect.stringMatching(/DATABASE_URL.*postgresql:\/\//)])
    expect(problems.join('\n')).not.toContain('hunter2')
  })
  it('names all three when all are missing', () => {
    expect(validateEnv({})).toHaveLength(3)
  })
  it('accepts a database, SITE_ROOT and a key', () => {
    expect(validateEnv({ DATABASE_URL: DB, SITE_ROOT: '/data/site', SECRETS_MASTER_KEY: KEY })).toEqual([])
    expect(validateEnv({ DATABASE_URL: 'postgres://db/site', SITE_ROOT: '/data/site', SECRETS_MASTER_KEY: KEY })).toEqual([])
  })
  it('no longer asks for Wasp\'s WASP_SERVER_URL or WASP_WEB_CLIENT_URL, even in production', () => {
    expect(validateEnv({ DATABASE_URL: DB, SITE_ROOT: '/data/site', SECRETS_MASTER_KEY: KEY, NODE_ENV: 'production' })).toEqual([])
  })
  it('no longer asks for the old separate host path or DOCKER_GID', () => {
    expect(validateEnv({ DATABASE_URL: DB, SITE_ROOT: '/data/site', SECRETS_MASTER_KEY: KEY, AGENT_CONTAINER_ISOLATION: 'true', NODE_ENV: 'production' })).toEqual([])
  })
})
