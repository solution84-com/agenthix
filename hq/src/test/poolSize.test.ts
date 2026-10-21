import { describe, it, expect } from 'vitest'
import { withTestPoolSize, TEST_POOL_SIZE } from './poolSize'

describe('withTestPoolSize', () => {
  it('sets a fixed pool size, whatever the machine’s CPU count', () => {
    const url = new URL(withTestPoolSize('postgresql://u:p@localhost:5432/agenthix_test'))
    expect(url.searchParams.get('connection_limit')).toBe(String(TEST_POOL_SIZE))
    expect(url.pathname).toBe('/agenthix_test')
  })

  it('keeps the other parameters the address already has', () => {
    const url = new URL(withTestPoolSize('postgresql://u:p@localhost:5432/agenthix_test?schema=public'))
    expect(url.searchParams.get('schema')).toBe('public')
    expect(url.searchParams.get('connection_limit')).toBe(String(TEST_POOL_SIZE))
  })

  it('leaves a pool size the address already sets', () => {
    const url = new URL(withTestPoolSize('postgresql://u:p@localhost:5432/agenthix_test?connection_limit=7'))
    expect(url.searchParams.get('connection_limit')).toBe('7')
  })

  it('leaves an address it cannot read for the database-name guard to refuse', () => {
    expect(withTestPoolSize('')).toBe('')
  })
})
