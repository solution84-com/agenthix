import { describe, it, expect } from 'vitest'
import { generateKeyPairSync, createHash } from 'node:crypto'
import { keyBinding, keylessBinding, publisherBinding, refsAllowed, type KeylessPublisherInput } from '../publisherInput'

const ISSUER = 'https://token.actions.githubusercontent.com'
const WORKFLOW = 'https://github.com/acme/skills/.github/workflows/release.yml'
const keyless = (over: Partial<KeylessPublisherInput> = {}): KeylessPublisherInput => ({
  kind: 'keyless', name: 'acme', displayName: 'Acme', issuer: ISSUER, identity: WORKFLOW,
  repository: 'https://github.com/acme/skills', allowTags: true, allowedBranch: null, ...over,
})

const message = (r: ReturnType<typeof keylessBinding>) => (r.ok ? '' : r.message)

describe('a keyless publisher as an administrator records it (H2)', () => {
  it('binds issuer, exact identity, repository and the refs allowed, under the canonical signer string', () => {
    const r = keylessBinding(keyless({ allowedBranch: 'main' }))
    expect(r).toEqual({ ok: true, binding: {
      name: 'acme', displayName: 'Acme', signerKind: 'KEYLESS', signerIdentity: `keyless:${ISSUER}#${WORKFLOW}`,
      issuer: ISSUER, certificateIdentity: WORKFLOW, repository: 'https://github.com/acme/skills', allowTags: true,
      allowedBranch: 'main', publicKey: null,
    } })
  })

  it('refuses a pattern, a ref on the identity, or nothing allowed to sign', () => {
    expect(message(keylessBinding(keyless({ identity: 'https://github.com/acme/*' })))).toContain('exactly')
    expect(message(keylessBinding(keyless({ identity: `${WORKFLOW}@refs/tags/v1.0.0` })))).toContain('Leave the ref off')
    expect(message(keylessBinding(keyless({ identity: '.*' })))).toContain('exactly')
    expect(message(keylessBinding(keyless({ allowTags: false, allowedBranch: null })))).toContain('Choose what may sign')
  })

  it('refuses addresses that would never match the certificate', () => {
    expect(keylessBinding(keyless({ issuer: 'http://token.actions.githubusercontent.com' })).ok).toBe(false)
    expect(keylessBinding(keyless({ repository: 'github.com/acme/skills' })).ok).toBe(false)
    expect(keylessBinding(keyless({ repository: 'https://github.com/acme/skills/' })).ok).toBe(false)
    expect(keylessBinding(keyless({ repository: 'https://github.com/acme/skills.git' })).ok).toBe(false)
  })

  it('takes a branch by its name, never a ref or a path', () => {
    for (const branch of ['refs/heads/main', '../main', 'feature/*', 'a b', '/main']) {
      expect(keylessBinding(keyless({ allowedBranch: branch })).ok, branch).toBe(false)
    }
    expect(keylessBinding(keyless({ allowTags: false, allowedBranch: 'release/1.x' })).ok).toBe(true)
  })

  it('records a person (W3) by issuer and email alone, with no tags or branch', () => {
    const r = keylessBinding(keyless({ issuer: 'https://accounts.google.com', identity: 'alice@example.com', repository: null, allowTags: false }))
    expect(r).toMatchObject({ ok: true, binding: { repository: null, allowTags: false, allowedBranch: null, signerIdentity: 'keyless:https://accounts.google.com#alice@example.com' } })
    expect(keylessBinding(keyless({ identity: 'alice@example.com', repository: null, allowTags: true })).ok).toBe(false)
    expect(keylessBinding(keyless({ repository: null, allowTags: false })).ok).toBe(false)
  })

  it('ends every refusal saying nothing was changed', () => {
    expect(message(keylessBinding(keyless({ identity: '' })))).toMatch(/Nothing was changed\.$/)
  })
})

describe('a key-pair publisher', () => {
  it('is stored by the sha256 of its key, with the key itself', () => {
    const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    const id = createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex')
    const r = keyBinding({ kind: 'key', name: 'acme', publicKey: pem })
    expect(r).toMatchObject({ ok: true, binding: { signerKind: 'KEY', signerIdentity: `key:${id}`, publicKey: pem, displayName: 'acme' } })
  })

  it('refuses what is not a public key, a private key included', () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    expect(keyBinding({ kind: 'key', name: 'acme', publicKey: 'hello' }).ok).toBe(false)
    expect(keyBinding({ kind: 'key', name: 'acme', publicKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }).ok).toBe(false)
  })
})

describe('publisherBinding', () => {
  it('needs a name and a kind', () => {
    expect(publisherBinding(null).ok).toBe(false)
    expect(publisherBinding({ name: 'x', kind: 'other' }).ok).toBe(false)
  })

  it('says in words what may sign', () => {
    expect(refsAllowed({ repository: 'r', allowTags: true, allowedBranch: 'main' })).toBe('tags and branch main')
    expect(refsAllowed({ repository: null, allowTags: false, allowedBranch: null })).toBeNull()
  })
})
