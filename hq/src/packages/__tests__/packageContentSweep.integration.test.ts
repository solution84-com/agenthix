import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'

// The content sweep against the real test DB (ADR-0094). The sweep takes the moment to judge by, so each test
// passes a `now` hours or days after the real one rather than waiting.

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { writePackage, readPackage } from '../packageStore'
import { sweepUnreferencedContent, PACKAGE_CONTENT_GRACE_MS } from '../packageContentSweep'

const file = (text: string) => [{ path: 'instructions.md', content: Buffer.from(text) }]
const HOUR = 60 * 60 * 1000
const later = (ms: number) => new Date(Date.now() + ms)

describe('package content sweep @SC-446', () => {
  it('keeps current content, however old', async () => {
    const { ref } = await writePackage({ kind: 'agent', key: 'a1', files: file('v'), updatedById: null })
    expect(await sweepUnreferencedContent(later(30 * PACKAGE_CONTENT_GRACE_MS))).toBe(0)
    await expect(readPackage(ref)).resolves.toBeDefined()
  })

  it('keeps content released within the grace period, so a run started before an edit is still served', async () => {
    const old = await writePackage({ kind: 'agent', key: 'a1', files: file('old'), updatedById: null })
    await writePackage({ kind: 'agent', key: 'a1', files: file('new'), updatedById: null })
    expect(await sweepUnreferencedContent(later(HOUR))).toBe(0)
    await expect(readPackage(old.ref)).resolves.toBeDefined()
  })

  it('removes content no package has pointed at for longer than the grace period, with its files, and only that', async () => {
    const old = await writePackage({ kind: 'agent', key: 'a1', files: file('old'), updatedById: null })
    const current = await writePackage({ kind: 'agent', key: 'a1', files: file('new'), updatedById: null })
    const shared = await writePackage({ kind: 'agent', key: 'a2', files: file('old'), updatedById: null })
    await writePackage({ kind: 'agent', key: 'a2', files: file('other'), updatedById: null })
    expect(shared.ref.digest).toBe(old.ref.digest)

    expect(await sweepUnreferencedContent(later(PACKAGE_CONTENT_GRACE_MS + HOUR))).toBe(1)
    await expect(readPackage(old.ref)).rejects.toThrow(/no longer holds/)
    await expect(readPackage(current.ref)).resolves.toBeDefined()
    expect(await prisma.packageFile.count({ where: { contentDigest: old.ref.digest } })).toBe(0)
  })

  it('removes content that was never pointed at once it is old enough, and keeps it while it is young', async () => {
    await prisma.packageContent.create({ data: { digest: 'u'.repeat(64), formatVersion: 1 } })
    expect(await sweepUnreferencedContent(later(HOUR))).toBe(0)
    expect(await sweepUnreferencedContent(later(PACKAGE_CONTENT_GRACE_MS + HOUR))).toBe(1)
    expect(await prisma.packageContent.count()).toBe(0)
  })

  it('never removes content another package still points at, even once one package has released it', async () => {
    const one = await writePackage({ kind: 'agent', key: 'a1', files: file('same'), updatedById: null })
    await writePackage({ kind: 'agent', key: 'a2', files: file('same'), updatedById: null })
    await writePackage({ kind: 'agent', key: 'a1', files: file('moved'), updatedById: null })
    expect(await sweepUnreferencedContent(later(5 * PACKAGE_CONTENT_GRACE_MS))).toBe(0)
    await expect(readPackage(one.ref)).resolves.toBeDefined()
  })
})

// The asset layer's records name content too (skills spec, data board: Retention; V6, D26). Each is the only thing
// naming the content, and the content is past the grace period.
describe('package content sweep keeps what the asset layer names', () => {
  const content = async (tag: string) =>
    (await prisma.packageContent.create({ data: { digest: tag.repeat(64), formatVersion: 1 } })).digest
  const pastGrace = () => later(PACKAGE_CONTENT_GRACE_MS + HOUR)
  const asset = () => prisma.asset.create({ data: { kind: 'SKILL', publisher: 'acme', name: 'review' } })
  const placeSkill = () => prisma.placeSkill.create({
    data: { placeType: 'project', placeId: 'p1', path: '.agents/skills/review', group: 'PLACE' },
  })

  it('keeps an asset version\'s content, and sweeps it once the version is gone', async () => {
    const digest = await content('a')
    const { id: assetId } = await asset()
    const version = await prisma.assetVersion.create({ data: { assetId, version: '1.0.0', digest, source: 'UPLOAD' } })
    expect(await sweepUnreferencedContent(pastGrace())).toBe(0)
    await prisma.assetVersion.delete({ where: { id: version.id } })
    expect(await sweepUnreferencedContent(pastGrace())).toBe(1)
  })

  it('keeps a draft\'s content and every revision\'s', async () => {
    const head = await content('b')
    const older = await content('c')
    const { id: assetId } = await asset()
    const draft = await prisma.draft.create({ data: { assetId, revision: 2, digest: head } })
    await prisma.draftRevision.createMany({
      data: [{ draftId: draft.id, number: 1, digest: older }, { draftId: draft.id, number: 2, digest: head }],
    })
    expect(await sweepUnreferencedContent(pastGrace())).toBe(0)
    await prisma.draft.delete({ where: { id: draft.id } })
    expect(await sweepUnreferencedContent(pastGrace())).toBe(2)
  })

  it('keeps a proposal\'s content', async () => {
    const digest = await content('d')
    await prisma.proposal.create({
      data: { aim: 'PROJECT', placeId: 'p1', name: 'review', description: 'Reviews code', digest, agentId: 'agent-1' },
    })
    expect(await sweepUnreferencedContent(pastGrace())).toBe(0)
    expect(await prisma.packageContent.count({ where: { digest } })).toBe(1)
  })

  it('keeps a place skill version\'s content', async () => {
    const digest = await content('e')
    const skill = await placeSkill()
    await prisma.placeSkillVersion.create({ data: { placeSkillId: skill.id, number: 1, digest } })
    expect(await sweepUnreferencedContent(pastGrace())).toBe(0)
    await prisma.placeSkill.delete({ where: { id: skill.id } })
    expect(await sweepUnreferencedContent(pastGrace())).toBe(1)
  })
})
