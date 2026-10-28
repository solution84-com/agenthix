import { describe, expect, it } from 'vitest'
import { identityWithoutRef } from '../certificate'
import { matchKeyless, signerString } from '../publishers'
import { BEACON_IDENTITY, BEACON_REPOSITORY, GITHUB_ISSUER, keylessRecord } from './fixtures'

type Keyless = Parameters<typeof matchKeyless>[0]
const signer = (over: Partial<Keyless> = {}): Keyless =>
  ({ kind: 'keyless', issuer: GITHUB_ISSUER, identity: BEACON_IDENTITY, repository: BEACON_REPOSITORY, ref: 'refs/tags/v1.0.0', ...over })

/*
 * A keyless publisher is bound exactly (security review H2): issuer, identity less its own ref, repository, and the
 * refs it may sign from, each compared as a whole string. Every case here is a signer an attacker can actually get a
 * valid Fulcio certificate for (their own fork, their own branch, another provider), and every one must miss.
 */
describe('who a keyless signature names @security-H2 @SC-1615', () => {
  const record = keylessRecord({ allowTags: true, allowedBranch: 'main' })

  it('is the trusted publisher only for its own issuer, identity, repository and a ref it allows', () => {
    expect(matchKeyless(signer(), [record])).toBe(record)
    expect(matchKeyless(signer({ ref: 'refs/heads/main' }), [record])).toBe(record)
  })

  it.each([
    ['another identity provider', { issuer: 'https://token.actions.example.com' }],
    ['the issuer with a trailing slash', { issuer: `${GITHUB_ISSUER}/` }],
    ['a fork of the repository', { identity: BEACON_IDENTITY.replace('sigstore-conformance', 'evil'), repository: BEACON_REPOSITORY.replace('sigstore-conformance', 'evil') }],
    ['the same workflow path in another repository', { repository: 'https://github.com/evil/extremely-dangerous-public-oidc-beacon' }],
    ['the identity in other letter case', { identity: BEACON_IDENTITY.toUpperCase() }],
    ['another workflow file in the repository', { identity: BEACON_IDENTITY.replace('.yml', '-copy.yml') }],
    ['a branch the publisher does not allow', { ref: 'refs/heads/feature/x' }],
    ['a branch named like the allowed one', { ref: 'refs/heads/main/x' }],
    ["a pull request's merge ref", { ref: 'refs/pull/1/merge' }],
    ['no ref at all', { ref: null }],
    ['no repository, as a person signs', { repository: null, ref: null }],
  ])('is not the publisher for %s', (_what, over) => {
    expect(matchKeyless(signer(over as Partial<Keyless>), [record])).toBeNull()
  })

  it('never takes a person\'s record for a workflow that names the same identity', () => {
    const person = keylessRecord({ certificateIdentity: 'alice@example.com', repository: null, allowTags: false, allowedBranch: null,
      signerIdentity: signerString(signer({ identity: 'alice@example.com', repository: null, ref: null })) })
    expect(matchKeyless(signer({ identity: 'alice@example.com', repository: null, ref: null }), [person])).toBe(person)
    expect(matchKeyless(signer({ identity: 'alice@example.com' }), [person])).toBeNull()
  })

  it('reads the ref off the identity only when it is the certificate\'s own, so a reusable workflow keeps its pin', () => {
    expect(identityWithoutRef(`${BEACON_IDENTITY}@refs/heads/feature`, 'refs/heads/feature')).toBe(BEACON_IDENTITY)
    const pinnedElsewhere = identityWithoutRef(`${BEACON_IDENTITY}@refs/tags/v1`, 'refs/heads/main')
    expect(matchKeyless(signer({ identity: pinnedElsewhere, ref: 'refs/heads/main' }), [record])).toBeNull()
  })

  it('needs the stored signer string to agree with the record\'s own columns', () => {
    const tampered = { ...record, certificateIdentity: 'https://github.com/evil/x/.github/workflows/release.yml' }
    expect(matchKeyless(signer(), [tampered])).toBeNull()
  })
})
