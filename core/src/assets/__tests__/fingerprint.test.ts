import { describe, expect, it } from 'vitest'
import { packageDigestInput, PACKAGE_FORMAT_VERSION } from '../../protocol/packages.js'
import {
  AssetFileListError, assetFingerprintInput, checkAssetFileList, isAssetFingerprint, isMetadataPath, signedStatement,
} from '../fingerprint.js'

const h = (c: string) => c.repeat(64)

describe('the fingerprint @SC-1598', () => {
  it('is the package digest input over every file, package.json included', () => {
    const files = [{ path: 'SKILL.md', sha256: h('a') }, { path: 'package.json', sha256: h('b') }]
    expect(assetFingerprintInput(files)).toBe(packageDigestInput({ formatVersion: PACKAGE_FORMAT_VERSION, files }))
    expect(assetFingerprintInput(files)).toContain('package.json')
  })

  it('does not depend on the order the files came in', () => {
    const a = [{ path: 'b.md', sha256: h('1') }, { path: 'a.md', sha256: h('2') }]
    expect(assetFingerprintInput(a)).toBe(assetFingerprintInput([...a].reverse()))
  })

  it('refuses a file list it cannot fingerprint unambiguously', () => {
    expect(() => assetFingerprintInput([{ path: 'a.md', sha256: h('1') }, { path: 'a.md', sha256: h('2') }]))
      .toThrow(AssetFileListError)
  })

  it('is written as 64 lowercase hex characters, as a package digest is', () => {
    expect(isAssetFingerprint(h('f'))).toBe(true)
    expect(isAssetFingerprint(`sha256:${h('f')}`)).toBe(false)
    expect(isAssetFingerprint(h('F'))).toBe(false)
    expect(isAssetFingerprint(h('f').slice(1))).toBe(false)
  })
})

describe('the file list check @security-H1 @SC-1598', () => {
  it('passes an ordinary skill', () => {
    expect(checkAssetFileList(['package.json', 'SKILL.md', 'scripts/run.sh', 'references/a.md'])).toEqual([])
  })

  it('refuses duplicate paths', () => {
    expect(checkAssetFileList(['SKILL.md', 'SKILL.md'])).toEqual([{ problem: 'duplicate', path: 'SKILL.md', other: 'SKILL.md' }])
  })

  it('refuses paths equal after case folding', () => {
    expect(checkAssetFileList(['SKILL.md', 'skill.md'])[0]).toMatchObject({ problem: 'case', path: 'skill.md', other: 'SKILL.md' })
    // Not a valid package path either, but the clash is reported first.
    expect(checkAssetFileList(['ref/Straße.md', 'ref/STRASSE.md'])[1]).toMatchObject({ problem: 'case', path: 'ref/STRASSE.md' })
    expect(checkAssetFileList(['Docs/a.md', 'docs/b.md'])[0]).toMatchObject({ problem: 'case', path: 'docs/b.md' })
  })

  it('refuses paths equal after Unicode normalisation', () => {
    const composed = 'café.md'
    const decomposed = 'café.md'
    expect(checkAssetFileList([composed, decomposed])).toEqual([
      { problem: 'invalid', path: composed },
      { problem: 'normalisation', path: decomposed, other: composed },
    ])
  })

  it('refuses an entry staging or the reader would skip as metadata', () => {
    for (const p of ['.DS_Store', 'scripts/.env', '__MACOSX/SKILL.md', 'a/__MACOSX/x', '.git/config']) {
      expect(isMetadataPath(p), p).toBe(true)
      expect(checkAssetFileList(['SKILL.md', p])[0], p).toMatchObject({ problem: 'metadata', path: p })
    }
    expect(isMetadataPath('scripts/__init__.py')).toBe(false)
  })

  it('refuses an unsafe path and a path that is also a folder', () => {
    expect(checkAssetFileList(['../x'])[0]).toMatchObject({ problem: 'invalid' })
    expect(checkAssetFileList(['/abs'])[0]).toMatchObject({ problem: 'invalid' })
    expect(checkAssetFileList(['refs', 'refs/a.md'])[0]).toMatchObject({ problem: 'folder' })
  })
})

describe('the signed statement @security-H1 @SC-1598', () => {
  const base = { format: 2, kind: 'skill' as const, publisher: 'acme', name: 'code-review', version: '1.3.0', fingerprint: h('9') }

  it('is canonical JSON of exactly six fields', () => {
    expect(signedStatement(base)).toBe(
      `{"fingerprint":"${h('9')}","format":2,"kind":"skill","name":"code-review","publisher":"acme","version":"1.3.0"}`)
  })

  it('gives the same bytes whatever the order of the fields', () => {
    const reordered = { fingerprint: h('9'), version: '1.3.0', name: 'code-review', publisher: 'acme', kind: 'skill' as const, format: 2 }
    expect(signedStatement(reordered)).toBe(signedStatement(base))
  })

  it('leaves out anything else the caller carries', () => {
    const extra = { ...base, basedOn: [], licence: 'MIT' } as typeof base
    expect(signedStatement(extra)).toBe(signedStatement(base))
  })

  it('refuses a statement with a field out of shape', () => {
    expect(() => signedStatement({ ...base, fingerprint: 'nope' })).toThrow(/fingerprint/)
    expect(() => signedStatement({ ...base, version: '1.3' })).toThrow(/version/)
    expect(() => signedStatement({ ...base, name: 'Bad' })).toThrow(/name/)
    expect(() => signedStatement({ ...base, kind: 'plugin' as never })).toThrow(/kind/)
  })
})
