import { describe, expect, it } from 'vitest'
import {
  ASSET_MANIFEST_FORMAT, AssetManifestError, BASED_ON_MAX_LINES, DESCRIPTION_MAX_LENGTH, parseAssetManifest,
} from '../manifest.js'

const fp = 'f'.repeat(64)
const valid = {
  format: 2, kind: 'skill', publisher: 'acme', name: 'code-review', description: 'Review pull requests', version: '1.3.0',
}
const parse = (over: Record<string, unknown>) => parseAssetManifest({ ...valid, ...over })
const refuses = (over: Record<string, unknown>, what: RegExp) => expect(() => parse(over)).toThrow(what)

describe('manifest format 2', () => {
  it('reads a minimal manifest', () => {
    expect(ASSET_MANIFEST_FORMAT).toBe(2)
    expect(parseAssetManifest(valid)).toEqual({ ...valid, basedOn: [], licence: null, suitedTo: [] })
  })

  it('reads licence and suitedTo, and drops fields it does not know', () => {
    const m = parse({ licence: 'MIT', suitedTo: ['developer', 'qa'], source: 'marketplace' })
    expect(m.licence).toBe('MIT')
    expect(m.suitedTo).toEqual(['developer', 'qa'])
    expect(m).not.toHaveProperty('source')
  })

  it('refuses what is not an object, and format 1', () => {
    for (const raw of [null, 'x', 42, [], undefined]) expect(() => parseAssetManifest(raw)).toThrow(AssetManifestError)
    refuses({ format: 1 }, /format 2/)
    refuses({ format: '2' }, /format 2/)
  })

  it('refuses a bad kind, publisher, name or version', () => {
    refuses({ kind: 'plugin' }, /kind/)
    refuses({ publisher: undefined }, /publisher/)
    refuses({ publisher: 'Acme Inc' }, /publisher/)
    refuses({ publisher: 'github.com/acme' }, /publisher/)
    refuses({ name: 'Code Review' }, /name/)
    refuses({ name: 'a'.repeat(65) }, /name/)
    refuses({ name: 'tmpl/skill' }, /name/)
    refuses({ version: '1.3' }, /version/)
    refuses({ version: 13 }, /version/)
  })

  it('takes the reserved publishers as claims: refusing them is for whoever checks the signer', () => {
    expect(parse({ publisher: 'agenthix' }).publisher).toBe('agenthix')
    expect(parse({ publisher: 'unsigned' }).publisher).toBe('unsigned')
  })

  it('bounds the description, licence and suitedTo', () => {
    refuses({ description: '' }, /description/)
    refuses({ description: '   ' }, /description/)
    refuses({ description: 'd'.repeat(DESCRIPTION_MAX_LENGTH + 1) }, /description/)
    expect(parse({ description: 'd'.repeat(DESCRIPTION_MAX_LENGTH) }).description).toHaveLength(DESCRIPTION_MAX_LENGTH)
    refuses({ licence: 'l'.repeat(201) }, /licence/)
    refuses({ licence: 'MIT\nother' }, /licence/)
    refuses({ licence: 7 }, /licence/)
    refuses({ suitedTo: 'developer' }, /suitedTo/)
    refuses({ suitedTo: ['Developers!'] }, /suitedTo/)
    refuses({ suitedTo: Array.from({ length: 11 }, (_, i) => `r${i}`) }, /suitedTo/)
    refuses({ suitedTo: ['qa', 'qa'] }, /suitedTo/)
  })
})

describe('basedOn', () => {
  const hqLine = { skill: 'agenthix/code-review', version: '1.3.0', fingerprint: fp, copied: '2026-10-27', recorded: 'hq' }
  const stated = { skill: 'blog.example.com/review-checklist', copied: '2026-10-27', recorded: 'stated' }

  it('reads a line hq wrote and a stated credit', () => {
    expect(parse({ basedOn: [hqLine, stated] }).basedOn).toEqual([hqLine, stated])
  })

  it('reads a role skill and a stated credit with a version and fingerprint', () => {
    const role = { ...hqLine, skill: 'agenthix/project-manager/read-context' }
    const statedFull = { ...stated, version: 'v2 (March)', fingerprint: fp }
    expect(parse({ basedOn: [role, statedFull] }).basedOn).toEqual([role, statedFull])
  })

  it("requires an hq line's identity, SemVer version and fingerprint", () => {
    refuses({ basedOn: [{ ...hqLine, skill: 'blog.example.com/x' }] }, /basedOn\[0\].*skill/)
    refuses({ basedOn: [{ ...hqLine, version: undefined }] }, /basedOn\[0\].*version/)
    refuses({ basedOn: [{ ...hqLine, version: '1.3' }] }, /basedOn\[0\].*version/)
    refuses({ basedOn: [{ ...hqLine, fingerprint: undefined }] }, /basedOn\[0\].*fingerprint/)
    refuses({ basedOn: [{ ...hqLine, fingerprint: `sha256:${fp}` }] }, /basedOn\[0\].*fingerprint/)
  })

  it('bounds a stated credit', () => {
    refuses({ basedOn: [{ ...stated, skill: '' }] }, /basedOn\[0\].*skill/)
    refuses({ basedOn: [{ ...stated, skill: 's'.repeat(201) }] }, /basedOn\[0\].*skill/)
    refuses({ basedOn: [{ ...stated, skill: 'a\u0000b' }] }, /basedOn\[0\].*skill/)
    refuses({ basedOn: [{ ...stated, version: 'v'.repeat(41) }] }, /basedOn\[0\].*version/)
    refuses({ basedOn: [{ ...stated, fingerprint: 'abc' }] }, /basedOn\[0\].*fingerprint/)
  })

  it('refuses a bad date, a bad recorded, and anything not a list of lines', () => {
    for (const copied of ['2026-13-01', '2026-02-30', '27/10/2026', '2026-10-27T00:00:00Z', 20261027, undefined]) {
      refuses({ basedOn: [{ ...stated, copied }] }, /copied/)
    }
    refuses({ basedOn: [{ ...stated, recorded: 'verified' }] }, /recorded/)
    refuses({ basedOn: [{ ...stated, recorded: undefined }] }, /recorded/)
    refuses({ basedOn: {} }, /basedOn/)
    refuses({ basedOn: ['agenthix/code-review'] }, /basedOn\[0\]/)
    refuses({ basedOn: [null] }, /basedOn\[0\]/)
    refuses({ basedOn: Array.from({ length: BASED_ON_MAX_LINES + 1 }, () => stated) }, /basedOn/)
  })

  it('keeps only the known fields of a line', () => {
    expect(parse({ basedOn: [{ ...stated, verified: true }] }).basedOn[0]).not.toHaveProperty('verified')
  })
})
