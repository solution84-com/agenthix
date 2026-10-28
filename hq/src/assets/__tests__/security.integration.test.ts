/**
 * Integration tests (ADR-0094 — real test DB) for the security review's findings where the guard is in what hq
 * writes: a new signer's name at install time (C1) and what hq records of a site's scan (L1). The signature check
 * itself is replaced by a verifier that names a new keyless signer, so the test reaches the naming step a real
 * signature would.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SCAN_SKILLS_MAX_PER_PLACE, type ScannedSkill } from '@agenthix/core'
import { prisma } from '../../test/db'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<object>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { installPackage } from '../install/commit'
import { previewInstall } from '../install/preview'
import type { Arrival, NewPublisherChoice } from '../install/types'
import { personActor } from '../policyActors'
import { organisationPublisher } from '../organisationPublisher'
import { recordScan } from '../places/scan'
import type { SignatureVerifier, SignerIdentity } from '../signing/types'
import { contextWithRole } from '../../agents/__tests__/definitionFixtures'

const SKILL = '---\nname: code-review\ndescription: Reviews code\n---\n\n# Review\n'
const manifest = JSON.stringify({ format: 2, kind: 'skill', publisher: 'agenthix-fan', name: 'code-review', version: '1.0.0', description: 'Reviews' })
const arrival = (): Arrival => ({
  source: 'upload', sourceUrl: null, bundle: Buffer.from('bundle'),
  arrived: { root: 'code-review', files: [{ path: 'SKILL.md', content: Buffer.from(SKILL) }, { path: 'package.json', content: Buffer.from(manifest) }] },
})

const signer: SignerIdentity = {
  kind: 'keyless', issuer: 'https://token.actions.githubusercontent.com',
  identity: 'https://github.com/agenthix/skills/.github/workflows/release.yml', repository: 'https://github.com/agenthix/skills', ref: 'refs/tags/v1',
}
const newSigner: SignatureVerifier = {
  async verify() { return { state: 'new-publisher', signer } },
  trustRootAge: () => ({ issuedAt: new Date(), expired: false }),
}
const deps = { db: prisma, verifier: newSigner, now: new Date() }

describe('naming a new signer at install @security-C1 @SC-1613', () => {
  let adminId: string
  beforeEach(async () => {
    await prisma.org.create({ data: { name: 'Fernhill' } })
    adminId = (await contextWithRole('ADMIN')).user.id
  })

  it('never offers a reserved name, even for a repository owned by an account called agenthix', async () => {
    const p = await previewInstall(arrival(), await personActor(adminId, prisma), deps)
    expect(p.state).toBe('new-publisher')
    expect(p.publisher).not.toBe('agenthix')
    expect(p.publisher).not.toBe('unsigned')
  })

  it.each([
    ['Agenthix\'s', 'agenthix'],
    ['the unsigned', 'unsigned'],
    ['the organisation\'s own', 'fernhill'],
  ])('refuses %s name sent in place of the one shown, and writes nothing', async (_what, name) => {
    const actor = await personActor(adminId, prisma)
    await organisationPublisher(prisma)
    const shown = await previewInstall(arrival(), actor, deps)
    for (const choice of ['trust', 'once'] as const) {
      const newPublisher: NewPublisherChoice = { choice, name, displayName: 'Agenthix' }
      await expect(installPackage(arrival(), { fingerprint: shown.fingerprint, newPublisher }, actor, deps)).rejects.toThrow(/Nothing was changed/)
    }
    expect(await prisma.trustedPublisher.count()).toBe(0)
    expect(await prisma.asset.count()).toBe(0)
  })

  it('refuses a name another signer already holds', async () => {
    await prisma.trustedPublisher.create({ data: {
      name: 'acme', displayName: 'Acme', signerKind: 'KEYLESS', signerIdentity: 'keyless:https://issuer#someone-else',
      issuer: 'https://issuer', certificateIdentity: 'someone-else', repository: null, allowTags: false, allowedBranch: null,
    } })
    const actor = await personActor(adminId, prisma)
    const shown = await previewInstall(arrival(), actor, deps)
    expect(shown.publisher).not.toBe('acme')
    const newPublisher: NewPublisherChoice = { choice: 'trust', name: 'acme', displayName: 'Acme' }
    await expect(installPackage(arrival(), { fingerprint: shown.fingerprint, newPublisher }, actor, deps)).rejects.toThrow(/Nothing was changed/)
    expect(await prisma.asset.count()).toBe(0)
  })
})

describe('the organisation\'s own name @security-C1 @SC-1613', () => {
  it.each([['Agenthix', 'agenthix-org'], ['Unsigned', 'unsigned-org']])('is never the reserved name for an organisation called %s', async (name, expected) => {
    await prisma.org.create({ data: { name } })
    expect(await organisationPublisher(prisma)).toBe(expected)
  })
})

describe('what hq records of a site\'s scan @security-L1 @SC-1641', () => {
  const place = { placeType: 'project' as const, placeId: 'p1' }
  const found = (n: number, fingerprint = 'a'.repeat(64)): ScannedSkill => ({ group: 'place', path: `s-${n}`, fingerprint, name: `s-${n}`, description: '' })

  it('writes at most the per-place cap of rows, whatever a site sends, and marks nothing gone when it cut', async () => {
    await recordScan(place, { skills: [found(9999)], problems: [], truncated: false })
    const flood = Array.from({ length: SCAN_SKILLS_MAX_PER_PLACE + 100 }, (_, n) => found(n))
    const rows = await recordScan(place, { skills: flood, problems: [], truncated: false })
    expect(rows).toHaveLength(SCAN_SKILLS_MAX_PER_PLACE)
    expect(await prisma.placeSkill.count({ where: place })).toBe(SCAN_SKILLS_MAX_PER_PLACE + 1)
    expect(await prisma.placeSkill.count({ where: { ...place, goneAt: { not: null } } })).toBe(0)
  })

  it('records no row for a finding whose fingerprint is not a digest', async () => {
    const rows = await recordScan(place, { skills: [found(1, 'x'), found(2, '../../etc'), found(3)], problems: [], truncated: false })
    expect(rows.map(r => r.path)).toEqual(['.agents/skills/s-3'])
  })
})
