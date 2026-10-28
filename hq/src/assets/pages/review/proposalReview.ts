/**
 * One proposal as the review screen reads it (board R1): the card's own view, plus every file with the bytes needed to
 * send it back unchanged after an edit, the difference from what is in use file by file, and the version accepting
 * would make. Who may see it is `viewProposal`'s rule: the person it was made for and the people who review its level.
 */
import type { PrismaClient } from '@prisma/client'
import type { Db } from '../../../packages/packageStore'
import { readContent } from '../../content'
import { nextVersion } from '../../lifecycle/versions'
import { newestVersion } from '../../places/placeDrafts'
import { viewProposal, type SkillProposalView } from '../../proposals/view'
import { changesBetween, fileViews, type ReviewChange, type ReviewFile } from './changes'

export type ProposalReview = {
  proposal: SkillProposalView
  files: ReviewFile[]
  changes: ReviewChange[]
  /** The version accepting makes, when HQ can say: a new skill's first, or the next of the organisation's own. */
  acceptsAs: string | null
}

async function inUse(db: Db, p: { assetId: string | null; placeSkillId: string | null }) {
  if (p.assetId) {
    const asset = await db.asset.findUnique({ where: { id: p.assetId }, include: { currentVersion: true, versions: { select: { version: true } } } })
    const files = asset?.currentVersion ? await readContent(asset.currentVersion.digest, db) : null
    return { files, versions: asset?.versions.map(v => v.version) ?? null }
  }
  if (p.placeSkillId) {
    const newest = await newestVersion(db, p.placeSkillId)
    return { files: newest ? await readContent(newest.digest, db) : null, versions: null }
  }
  return { files: null, versions: null }
}

export async function proposalReview(db: PrismaClient, viewerId: string, proposalId: unknown): Promise<ProposalReview> {
  const proposal = await viewProposal(db, viewerId, proposalId)
  const row = await db.proposal.findUniqueOrThrow({ where: { id: proposal.id }, select: { digest: true, assetId: true, placeSkillId: true } })
  const proposed = await readContent(row.digest, db)
  const current = await inUse(db, row)
  const acceptsAs = proposal.aim !== 'ORGANISATION' ? null
    : row.assetId ? (proposal.makesCopy || !current.versions ? null : nextVersion(current.versions, 'minor'))
    : '1.0.0'
  return { proposal, files: fileViews(proposed), changes: changesBetween(current.files, proposed), acceptsAs }
}
