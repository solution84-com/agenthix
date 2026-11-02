/** A live preview's questions: hq's own words, only what the site said, forgotten when it stops. */
import { beforeEach, describe, expect, it } from 'vitest'
import { __resetQuestionsForTests, forgetLivePreview, isBlocked, keepBlocked, keepServices, questionsOf } from '../questions'

const HASH = 'a'.repeat(64)

beforeEach(() => __resetQuestionsForTests())

describe('questions @SC-1709', () => {
  it('asks about a waiting service by its name and image, and drops what is not a service', () => {
    keepServices('lp', [
      { name: 'db', state: 'waiting', declarationHash: HASH, declaration: { image: 'postgres:16' }, detail: null },
      { name: 'bad', state: 'nonsense', declarationHash: HASH, declaration: {}, detail: null },
    ])
    const [q] = questionsOf('lp')
    expect(questionsOf('lp')).toHaveLength(1)
    expect(q).toMatchObject({ kind: 'service.start', service: 'db', declaration: HASH, image: 'postgres:16' })
    expect(q!.question).toContain('db (postgres:16)')
  })

  it('asks about a blocked package once, and forgets everything when the live preview stops', () => {
    const pkg = { ecosystem: 'npm', name: 'esbuild', version: '0.20.0' }
    keepBlocked('lp', pkg, null, { allowed: false, registryUnreachable: true })
    keepBlocked('lp', pkg, null, { allowed: false, registryUnreachable: true })
    expect(questionsOf('lp')).toHaveLength(1)
    expect(isBlocked('lp', pkg)).toBe(true)
    forgetLivePreview('lp')
    expect(questionsOf('lp')).toEqual([])
  })

  it('refuses a package named with characters a person should not be shown', () => {
    expect(keepBlocked('lp', { ecosystem: 'npm', name: 'x\u001b[2J', version: '1' }, null, { allowed: false, registryUnreachable: true })).toBe(false)
  })
})
