import { describe, it, expect } from 'vitest'
import { decide } from '../decide'
import type { PackageParts, PackagePart } from '../parts'
import type { SignerIdentity, TrustedPublisherRecord, VerifyOutcome } from '../../signing/types'

const part = (over: Partial<PackagePart> = {}): PackagePart => ({
  kind: 'skill', name: 'code-review', version: '1.0.0', claim: 'acme', title: 'Code Review', description: 'd',
  basedOn: [], licence: null, suitedTo: [], files: [], plain: false, role: false, ...over,
})
const parts = (over: Partial<PackagePart> = {}, embedded: PackagePart[] = []): PackageParts => ({ ...part(over), embedded })
const signer: SignerIdentity = { kind: 'keyless', issuer: 'https://token.actions.githubusercontent.com', identity: 'https://github.com/acme/skills/.github/workflows/release.yml', repository: 'https://github.com/acme/skills', ref: 'refs/tags/v1' }
const record = (name: string): TrustedPublisherRecord => ({
  id: 'tp1', name, signerIdentity: 'keyless:x#y', signerKind: 'KEYLESS', issuer: null, certificateIdentity: null,
  repository: null, allowTags: true, allowedBranch: null, publicKey: null,
})
const trusted = (name: string): VerifyOutcome => ({ state: 'trusted', signer, publisher: record(name) })

describe('the state and the publisher (C1) @security-C1 @SC-1613', () => {
  it('takes the publisher from the verified signer, never the manifest', () => {
    const d = decide('upload', trusted('acme-corp'), parts({ claim: 'acme' }))
    expect(d).toMatchObject({ state: 'trusted', publisher: 'acme-corp', refusal: null })
    expect(d.warnings[0]).toMatch(/calls its publisher acme/)
  })

  it('installs an unsigned package as unsigned, whatever it claims', () => {
    expect(decide('upload', { state: 'unsigned' }, parts({ claim: 'acme' }))).toMatchObject({ state: 'unsigned', publisher: 'unsigned', refusal: null })
  })

  it("trusts hq's image by location, as Agenthix", () => {
    expect(decide('image', null, parts({ claim: null, plain: true }))).toMatchObject({ state: 'built-in', publisher: 'agenthix', refusal: null })
  })

  it('refuses a package claiming agenthix that Agenthix did not sign: unsigned, a new signer, or another trusted one', () => {
    for (const outcome of [{ state: 'unsigned' } as VerifyOutcome, { state: 'new-publisher', signer } as VerifyOutcome, trusted('acme')]) {
      expect(decide('upload', outcome, parts({ claim: 'agenthix' })).refusal).toMatch(/says it is published by Agenthix, but Agenthix didn't sign it/)
    }
    expect(decide('url', trusted('agenthix'), parts({ claim: 'agenthix' })).refusal).toBeNull()
  })

  it('refuses an embedded skill that claims another publisher, Agenthix included', () => {
    const team = (claim: string) => parts({ kind: 'team', claim: 'evil' }, [part({ name: 'working-with-git', claim })])
    expect(decide('upload', trusted('evil'), team('acme')).refusal).toMatch(/working-with-git inside this package says it is published by acme/)
    expect(decide('upload', trusted('evil'), team('agenthix')).refusal).toMatch(/Agenthix didn't sign it/)
    expect(decide('upload', trusted('evil'), team('evil')).refusal).toBeNull()
    expect(decide('upload', trusted('evil'), parts({ kind: 'team', claim: 'evil' }, [part({ claim: null })])).refusal).toBeNull()
  })

  it('refuses a tampered package with no override, and one whose signature cannot be checked', () => {
    expect(decide('upload', { state: 'tampered', reason: 'digest' }, parts()).refusal).toBe("This was changed after it was signed. It won't be installed. Nothing was changed.")
    expect(decide('upload', { state: 'unverifiable', reason: 'the trust root expired' }, parts()).refusal).toMatch(/the trust root expired/)
  })

  it('leaves a new keyless signer to be named, and refuses a new key outright @security-H2', () => {
    expect(decide('upload', { state: 'new-publisher', signer }, parts())).toMatchObject({ state: 'new-publisher', publisher: null, refusal: null })
    expect(decide('upload', { state: 'new-publisher', signer: { kind: 'key', keyId: 'ab'.repeat(32) } }, parts()).refusal).toMatch(/key this organisation hasn't added/)
  })

  it("refuses an image package naming another publisher", () => {
    expect(decide('image', null, parts({ claim: 'acme' })).refusal).toMatch(/other than Agenthix/)
  })
})
