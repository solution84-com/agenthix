import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The asset layer's keys, read from the schema's text (skills spec, data board records 1–10).

const schema = readFileSync(join(__dirname, '../../../schema.prisma'), 'utf8')

function model(name: string): string {
  const body = new RegExp(`\\nmodel ${name} \\{([\\s\\S]*?)\\n\\}`).exec(schema)?.[1]
  if (!body) throw new Error(`model ${name} not found in schema.prisma`)
  return body
}

function fieldType(body: string, field: string): string {
  const type = new RegExp(`^\\s+${field}\\s+(\\S+)`, 'm').exec(body)?.[1]
  if (!type) throw new Error(`field ${field} not found`)
  return type
}

describe('asset records', () => {
  it('key an identity on kind, publisher and name, none of them nullable, so a taken name cannot be written twice (T10)', () => {
    const asset = model('Asset')
    expect(asset).toMatch(/@@unique\(\[kind, publisher, name\]\)/)
    for (const field of ['kind', 'publisher', 'name']) expect(fieldType(asset, field)).not.toMatch(/\?$/)
  })

  it('give each trusted publisher a name no other signer can take, and never delete one', () => {
    const publisher = model('TrustedPublisher')
    expect(publisher).toMatch(/^\s+name\s+String\s+@unique/m)
    expect(publisher).toMatch(/^\s+signerIdentity\s+String\s+@unique/m)
    expect(publisher).toMatch(/^\s+removedAt\s+DateTime\?/m)
    expect(model('AssetVersion')).toMatch(/trustedPublisher\s+TrustedPublisher\?\s+@relation\([^)]*onDelete: SetNull\)/)
  })

  it('key a place skill on its place and path, and each version on its number', () => {
    expect(model('PlaceSkill')).toMatch(/@@unique\(\[placeType, placeId, path\]\)/)
    expect(model('PlaceSkillVersion')).toMatch(/@@unique\(\[placeSkillId, number\]\)/)
    expect(model('AssetVersion')).toMatch(/@@unique\(\[assetId, version\]\)/)
  })

  it('keep one draft per asset or place skill, and number its revisions', () => {
    const draft = model('Draft')
    expect(draft).toMatch(/^\s+assetId\s+String\?\s+@unique/m)
    expect(draft).toMatch(/^\s+placeSkillId\s+String\?\s+@unique/m)
    expect(model('DraftRevision')).toMatch(/@@unique\(\[draftId, number\]\)/)
  })

  it('refuse to delete content any asset record names', () => {
    for (const name of ['AssetVersion', 'Draft', 'DraftRevision', 'Proposal', 'PlaceSkillVersion']) {
      expect(model(name)).toMatch(/content\s+PackageContent\s+@relation\([^)]*onDelete: Restrict\)/)
    }
  })
})
