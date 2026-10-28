import { describe, it, expect } from 'vitest'
import { classify, summarise, type ExistingAsset } from '../plan'

const FP = (c: string) => c.repeat(64)
const input = { kind: 'skill' as const, name: 'code-review', title: 'Code Review', version: '1.3.0', fingerprint: FP('a') }
const existing = (over: Partial<ExistingAsset> = {}): ExistingAsset => ({
  id: 'as1', builtIn: false, removed: false,
  current: { version: '1.3.0', digest: FP('a'), signerIdentity: 'keyless:i#x' },
  versions: [{ version: '1.3.0', digest: FP('a'), signerIdentity: 'keyless:i#x' }],
  ...over,
})

describe('de-duplication by identity (I3) @SC-1618', () => {
  it('installs what is not here', () => {
    expect(classify(null, input, 'acme', 'keyless:i#x')).toMatchObject({ outcome: 'new', identity: 'acme/code-review', existingId: null })
  })

  it('reuses the same version', () => {
    expect(classify(existing(), input, 'acme', 'keyless:i#x')).toMatchObject({ outcome: 'same', held: true })
  })

  it('offers a newer version as an update, and leaves the installed one alone for an older one', () => {
    expect(classify(existing(), { ...input, version: '1.4.0', fingerprint: FP('b') }, 'acme', 'keyless:i#x')).toMatchObject({ outcome: 'update', installedVersion: '1.3.0', held: false })
    expect(classify(existing(), { ...input, version: '1.2.0', fingerprint: FP('c') }, 'acme', 'keyless:i#x')).toMatchObject({ outcome: 'older' })
    expect(classify(existing(), { ...input, version: '1.3.0-rc.1', fingerprint: FP('c') }, 'acme', 'keyless:i#x')).toMatchObject({ outcome: 'older' })
  })

  it('refuses the same version with different content', () => {
    expect(classify(existing(), { ...input, fingerprint: FP('f') }, 'acme', 'keyless:i#x')).toMatchObject({ outcome: 'refused', reason: expect.stringMatching(/already here with different content/) })
  })

  it('refuses a different signer under the same name, never an update @security-C1', () => {
    expect(classify(existing(), { ...input, version: '9.0.0' }, 'acme', 'keyless:i#evil').outcome).toBe('refused')
    expect(classify(existing(), { ...input, version: '9.0.0' }, 'acme', null).outcome).toBe('refused')
  })

  it("refuses a built-in's identity @security-C1", () => {
    expect(classify(existing({ builtIn: true }), input, 'agenthix', null)).toMatchObject({ outcome: 'refused', reason: expect.stringMatching(/built into hq/) })
  })

  it('brings a removed asset back', () => {
    expect(classify(existing({ removed: true }), input, 'acme', 'keyless:i#x')).toMatchObject({ outcome: 'restore', held: true })
  })

  it("treats Agenthix's image and Agenthix's signature as one signer", () => {
    const shelf = existing({ current: { version: '1.0.0', digest: FP('a'), signerIdentity: null }, versions: [{ version: '1.0.0', digest: FP('a'), signerIdentity: null }] })
    expect(classify(shelf, { ...input, version: '1.1.0', fingerprint: FP('b') }, 'agenthix', 'keyless:agenthix#release').outcome).toBe('update')
  })
})

describe('what comes with a package (I6) @SC-1618', () => {
  it('says what a template brings', () => {
    const main = classify(null, { ...input, kind: 'team', name: 'delivery' }, 'agenthix', null)
    const items = [
      classify(null, input, 'agenthix', null),
      classify(null, { ...input, name: 'read-context' }, 'agenthix', null),
      classify(existing(), input, 'agenthix', null),
      classify(existing(), { ...input, version: '1.4.0', fingerprint: FP('b') }, 'agenthix', null),
    ]
    expect(summarise(main, items)).toBe('This team template brings 4 skills: 2 new, 1 you already have, 1 newer than yours, update offered.')
  })

  it("counts a template's role skills apart from the shared ones it brings", () => {
    const main = classify(null, { ...input, kind: 'agent', name: 'project-manager' }, 'agenthix', null)
    const items = [
      classify(null, { ...input, name: 'project-manager/read-context' }, 'agenthix', null),
      classify(null, { ...input, name: 'project-manager/assign-work' }, 'agenthix', null),
      classify(null, input, 'agenthix', null),
      classify(existing(), input, 'agenthix', null),
      classify(existing(), { ...input, version: '1.4.0', fingerprint: FP('b') }, 'agenthix', null),
    ]
    expect(summarise(main, items)).toBe('This agent template brings 5 skills: 2 for its role, 1 new, 1 you already have, 1 newer than yours, update offered.')
  })

  it('says what installing one skill does', () => {
    expect(summarise(classify(null, input, 'acme', null), [])).toBe('Installs Code Review 1.3.0 as acme/code-review.')
  })
})
