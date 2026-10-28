import { describe, expect, it } from 'vitest'
import { identityWithoutRef } from '../certificate'
import { matchKeyless, refAllowed, signerString } from '../publishers'
import { BEACON_IDENTITY, BEACON_REPOSITORY, GITHUB_ISSUER, keylessRecord } from './fixtures'

const workflow = (ref: string | null) =>
  ({ kind: 'keyless' as const, issuer: GITHUB_ISSUER, identity: BEACON_IDENTITY, repository: BEACON_REPOSITORY, ref })

describe('refAllowed @security-H2 @SC-1615', () => {
  const tagsOnly = { allowTags: true, allowedBranch: null }
  const mainOnly = { allowTags: false, allowedBranch: 'main' }

  it('allows a tag only when tags are allowed', () => {
    expect(refAllowed('refs/tags/v1.2.0', tagsOnly)).toBe(true)
    expect(refAllowed('refs/tags/v1.2.0', mainOnly)).toBe(false)
  })

  it('allows exactly the default branch', () => {
    expect(refAllowed('refs/heads/main', mainOnly)).toBe(true)
    expect(refAllowed('refs/heads/main', tagsOnly)).toBe(false)
  })

  it.each(['refs/heads/feature', 'refs/heads/main-old', 'refs/heads/mainx', 'refs/pull/7/merge', 'refs/tags/', 'main', ''])(
    'refuses %j for a publisher that allows tags and main',
    ref => expect(refAllowed(ref, { allowTags: ref === 'refs/tags/' ? true : false, allowedBranch: 'main' })).toBe(false),
  )

  it('refuses a certificate with no ref', () => {
    expect(refAllowed(null, { allowTags: true, allowedBranch: 'main' })).toBe(false)
  })
})

describe('matchKeyless @security-H2 @SC-1615', () => {
  it('trusts a release workflow from a tag when tags are allowed', () => {
    const record = keylessRecord({ allowTags: true, allowedBranch: null })
    expect(matchKeyless(workflow('refs/tags/v2.0.0'), [record])).toBe(record)
  })

  it('does not trust the same workflow run from a feature branch', () => {
    expect(matchKeyless(workflow('refs/heads/feature'), [keylessRecord({ allowTags: true })])).toBeNull()
  })

  it('trusts a person by issuer and identity alone', () => {
    const person = { kind: 'keyless' as const, issuer: 'https://github.com/login/oauth', identity: 'alice@example.com', repository: null, ref: null }
    const record = keylessRecord({
      issuer: person.issuer, certificateIdentity: person.identity, repository: null, allowedBranch: null,
      signerIdentity: signerString(person),
    })
    expect(matchKeyless(person, [record])).toBe(record)
    expect(matchKeyless({ ...person, ref: 'refs/heads/main' }, [record])).toBeNull()
  })
})

describe('identityWithoutRef @SC-1615', () => {
  const base = `${BEACON_IDENTITY}`

  it('removes exactly the certificate’s own ref', () => {
    expect(identityWithoutRef(`${base}@refs/tags/v1`, 'refs/tags/v1')).toBe(base)
  })

  it('keeps an identity whose suffix is another ref, as a reusable workflow’s is', () => {
    expect(identityWithoutRef(`${base}@refs/tags/v1`, 'refs/heads/main')).toBe(`${base}@refs/tags/v1`)
  })

  it('keeps an identity when there is no ref', () => {
    expect(identityWithoutRef('alice@example.com', null)).toBe('alice@example.com')
  })

  it('never reduces an identity to nothing', () => {
    expect(identityWithoutRef('@refs/heads/main', 'refs/heads/main')).toBe('@refs/heads/main')
  })
})

describe('signerString @SC-1615', () => {
  it('is the canonical form stored on trusted publishers', () => {
    expect(signerString(workflow('refs/heads/main'))).toBe(`keyless:${GITHUB_ISSUER}#${BEACON_IDENTITY}`)
    expect(signerString({ kind: 'key', keyId: 'ab'.repeat(32) })).toBe(`key:${'ab'.repeat(32)}`)
  })
})
