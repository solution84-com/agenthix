/**
 * Executor image upgrades (workflows spec part 1, *Image upgrades*). The image's digest is part of every version's
 * hash, so a new image makes a new version of each approved one: the same files and settings under the new digest.
 * hq keeps the approval when the new image is the same release line and its tools stage is unchanged (the stage's
 * content key is the same); otherwise the new version waits, shown as *needs approval again: the executor image
 * changed*, and the approved one keeps running on the image it was approved with until a person approves.
 */
import { HttpError, prisma } from 'wasp/server'
import { Prisma } from '@prisma/client'
import { hashWorkflowVersion } from '@agenthix/core'
import type { ExecutorImage } from './executorImage'
import { contentOf } from './versionContent'

export const NEEDS_APPROVAL_AGAIN = 'needs approval again: the executor image changed'

/** `1.4.2`, `v1.4.0-rc.1` → `1.4`; null for anything else. */
export function releaseLine(release: string | null): string | null {
  const m = release ? /^v?(\d+)\.(\d+)\.\d+(?:-[0-9A-Za-z.-]+)?$/.exec(release) : null
  return m ? `${m[1]}.${m[2]}` : null
}

/** Keep the approval only when both images say what they are and agree on release line and tools stage. */
export function upgradeKeepsApproval(from: ExecutorImage, to: ExecutorImage): boolean {
  const line = releaseLine(from.release)
  if (line === null || line !== releaseLine(to.release)) return false
  return from.toolsKey !== null && from.toolsKey === to.toolsKey
}

export type UpgradeOutcome = { versionId: string; number: number; kept: boolean } | { skipped: 'not_on_image' | 'already_made' }

/** Makes the new version of one approved version under `to`, approved automatically or waiting for a person. */
export async function upgradeApprovedVersion(versionId: string, from: ExecutorImage, to: ExecutorImage): Promise<UpgradeOutcome> {
  const old = await prisma.workflowVersion.findUnique({
    where: { id: versionId },
    include: { files: true, workflow: { select: { placeType: true, placeId: true } } },
  })
  if (!old || old.state !== 'APPROVED') throw new HttpError(409, 'Only an approved version is carried to a new executor image. Nothing was changed.')
  if (old.executorImageDigest !== from.digest) return { skipped: 'not_on_image' }
  const content = { ...contentOf(old), executorImageDigest: to.digest }
  const hash = await hashWorkflowVersion(content)
  const kept = upgradeKeepsApproval(from, to)

  return prisma.$transaction(async (tx) => {
    await tx.workflow.update({ where: { id: old.workflowId }, data: { updatedAt: new Date() } })
    if (await tx.workflowVersion.findUnique({ where: { workflowId_hash: { workflowId: old.workflowId, hash } }, select: { id: true } })) {
      return { skipped: 'already_made' as const }
    }
    const last = await tx.workflowVersion.aggregate({ where: { workflowId: old.workflowId }, _max: { number: true } })
    const number = (last._max.number ?? 0) + 1
    const made = await tx.workflowVersion.create({
      data: {
        workflowId: old.workflowId,
        number,
        hash,
        definition: old.definition as Prisma.InputJsonValue,
        githubSecretNames: old.githubSecretNames,
        executorImageDigest: to.digest,
        state: kept ? 'APPROVED' : 'PROPOSED',
        origin: 'IMAGE_UPGRADE',
        upgradeOfId: old.id,
        // The content is the same, so what the plain checks and the reviewer found still applies.
        checkFlags: old.checkFlags ?? Prisma.JsonNull,
        checkSummary: old.checkSummary,
        cardMayApprove: kept ? old.cardMayApprove : false,
        reviewLevel: old.reviewLevel,
        reviewPoints: old.reviewPoints ?? Prisma.JsonNull,
        reviewedAt: old.reviewedAt,
        files: { create: old.files.map((f) => ({ path: f.path, content: f.content, executable: f.executable })) },
      },
      select: { id: true },
    })
    if (kept) {
      await tx.workflowVersion.update({ where: { id: old.id }, data: { state: 'SUPERSEDED' } })
      await tx.workflowApproval.create({
        data: {
          workflowId: old.workflowId,
          placeType: old.workflow.placeType,
          placeId: old.workflow.placeId,
          versionId: made.id,
          hash,
          approvedById: null,
          automatic: true,
        },
      })
    }
    return { versionId: made.id, number, kept }
  })
}
