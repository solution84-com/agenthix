import { describe, expect, it } from 'vitest'
import { publisherLine } from '../publisherLine'

describe('a trusted publisher in words (board R2)', () => {
  it('says Agenthix is always trusted and what it signs', () => {
    expect(publisherLine({ kind: 'built-in', status: 'trusted', repository: null, identity: null, refs: null, keyId: null, addedAt: null }))
      .toBe("Always trusted. Signs Agenthix's own skills and templates; they come with HQ itself.")
  })

  it('says what a keyless signature proves: the repository, the workflow and the refs', () => {
    const line = publisherLine({ kind: 'keyless', status: 'trusted', repository: 'https://github.com/acme/skills', identity: 'https://github.com/acme/skills/.github/workflows/release.yml', refs: 'tags and branch main', keyId: null, addedAt: '2026-10-27T10:00:00.000Z' })
    expect(line).toContain('github.com/acme/skills · workflow https://github.com/acme/skills/.github/workflows/release.yml (tags and branch main) (keyless)')
    expect(line).toMatch(/Added /)
  })

  it('says a key by its fingerprint, and a removed one is not trusted now', () => {
    expect(publisherLine({ kind: 'key', status: 'remembered', repository: null, identity: null, refs: null, keyId: 'SHA256:4f1c', addedAt: null }))
      .toBe('key SHA256:4f1c · Not trusted now. Installed once, or removed.')
  })

  it('ends with how many of what it signed are installed', () => {
    expect(publisherLine({ kind: 'built-in', status: 'trusted', repository: null, identity: null, refs: null, keyId: null, addedAt: null, installed: 23 }))
      .toBe("Always trusted. Signs Agenthix's own skills and templates; they come with HQ itself. · 23 installed")
    expect(publisherLine({ kind: 'key', status: 'trusted', repository: null, identity: null, refs: null, keyId: 'SHA256:4f1c', addedAt: null, installed: 0 }))
      .toBe('key SHA256:4f1c · 0 installed')
  })
})
