/**
 * The executor image a site runs workflow steps on, as hq knows it from the site's health report: its digest, which
 * is part of every version's hash, the release it came with, and the content key of its tools stage, which decides
 * whether an approval survives an upgrade (spec part 1, *Image upgrades*).
 *
 * A site that hasn't reported one can't take a workflow: a version hashed with no real image could never run there.
 * When a site reports a new image, every approved version of a place whose storage it holds is carried to it
 * (`imageUpgrade.ts`): approved again automatically when the tools are unchanged, otherwise waiting for a person
 * while the version approved before keeps running on its own image.
 */
import { HttpError, prisma } from 'wasp/server'
import { parseSiteHealth, type ExecutorImageReport, type SiteHealth } from '@agenthix/core'
import { Logger } from '../server/utils/logger'
import { resolveStorageSite } from '../storage/storageSite'
import { upgradeApprovedVersion } from './imageUpgrade'

export type ExecutorImage = { digest: string; release: string | null; toolsKey: string | null }

const logger = new Logger('ExecutorImage')

export const NO_EXECUTOR_IMAGE =
  'The Execution Site that holds this place\'s storage hasn\'t reported an executor image, so it can\'t take a workflow ' +
  'yet; it may need upgrading, or the image pulling on that machine. Nothing was changed.'

export function imageOfReport(report: ExecutorImageReport | null | undefined): ExecutorImage | null {
  if (!report?.present || !report.digest) return null
  return { digest: report.digest, release: report.release, toolsKey: report.toolsKey }
}

export async function executorImageForSite(siteId: string): Promise<ExecutorImage> {
  const site = await prisma.executionSite.findFirst({ where: { siteId }, select: { health: true } })
  const image = imageOfReport(site?.health ? parseSiteHealth(site.health)?.executorImage : null)
  if (!image) throw new HttpError(409, NO_EXECUTOR_IMAGE)
  return image
}

/** Whether a health report moves the site to another executor image than the one before it. */
export function executorImageChanged(before: SiteHealth | null, after: SiteHealth): ExecutorImage | null {
  const next = imageOfReport(after.executorImage)
  if (!next) return null
  const prev = imageOfReport(before?.executorImage)
  return prev?.digest === next.digest ? null : next
}

/**
 * Carries the approved versions of every place whose storage this site holds to its new image. `before` is what
 * the site reported last; a version on an image hq knows nothing about (an earlier report, gone) needs approval again.
 */
export async function carryApprovedVersionsToImage(siteId: string, before: SiteHealth | null, to: ExecutorImage): Promise<void> {
  const prev = imageOfReport(before?.executorImage)
  const versions = await prisma.workflowVersion.findMany({
    where: { state: 'APPROVED', executorImageDigest: { not: to.digest } },
    select: { id: true, executorImageDigest: true, workflow: { select: { placeType: true, placeId: true } } },
  })
  const siteOfPlace = new Map<string, string | null>()
  for (const v of versions) {
    const key = `${v.workflow.placeType}:${v.workflow.placeId}`
    if (!siteOfPlace.has(key)) {
      const site = await resolveStorageSite({ ownerType: v.workflow.placeType, ownerId: v.workflow.placeId, workspaceId: null }).catch(() => null)
      siteOfPlace.set(key, site)
    }
    if (siteOfPlace.get(key) !== siteId) continue
    const from: ExecutorImage = prev?.digest === v.executorImageDigest ? prev : { digest: v.executorImageDigest, release: null, toolsKey: null }
    try {
      await upgradeApprovedVersion(v.id, from, to)
    } catch (err) {
      logger.warn(`version ${v.id}: not carried to the new executor image: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
