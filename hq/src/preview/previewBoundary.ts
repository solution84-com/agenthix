/**
 * What a run may preview: the storage boundary it works in, and the site that
 * holds it.
 *
 * ## The boundary is never taken from the caller
 *
 * `preview.start` is in substance "run this command inside the boundary's
 * container". That is acceptable only because the caller is a run that is
 * already inside that container, with a shell of its own (ADR-0060) — so it
 * grants nothing the run did not already have. The property the whole
 * arrangement rests on is that the BOUNDARY comes from the run's verified
 * capability claims and never from the wire. Accept a caller-supplied owner
 * here and a run in one project could preview — and so execute — inside
 * another project's container.
 *
 * So the claims are the only input, and the location is derived from the
 * session row they name. This is the kind of thing a later refactor
 * "simplifies" into a parameter; it must not become one.
 *
 * ## Why every refusal here is a ControlPlaneError
 *
 * An agent reaches a preview through the control-plane forward, and
 * `dataApi.ts` answers a plain `Error` with `500 {"error":"internal error"}`
 * so that a Prisma message cannot leak to a site. A reason written here as a
 * plain `Error` would therefore never be read by the person it is for. See
 * `startPreviewTool.ts` for the same argument at greater length.
 */
import { prisma } from 'wasp/server'
import type { LocationRef } from '@agenthix/core'
import { resolvePrimaryLocation } from '../storage/primaryLocationService'
import { fetchPrimaryOwnerSlug } from '../agents/locationResolver'
import { resolveOwnerSiteId } from '../storage/ownerSite'
import { ControlPlaneError } from '../server/controlplane/types'

export interface PreviewBoundary {
  /** The run's own agent and session, as the verified claims named them. */
  agentId: string
  sessionId: string
  /** The Execution Site holding the boundary's container. */
  siteId: string
  /** The boundary whose files the preview serves. */
  location: LocationRef
  /** The owner's name, which hq holds and the site does not. */
  ownerSlug: string
}

export async function resolvePreviewBoundary(claims: {
  agentId: string
  sessionId: string
}): Promise<PreviewBoundary> {
  const session = await prisma.agentSession.findUnique({
    where: { id: claims.sessionId },
    select: {
      primaryOwnerType: true, primaryOwnerId: true, primaryWorkspaceId: true,
      taskId: true, userId: true, sessionType: true,
    },
  })
  if (!session) throw new ControlPlaneError('not_found', `Session '${claims.sessionId}' not found`)

  const location = resolvePrimaryLocation(session)

  const [siteId, ownerSlug] = await Promise.all([
    resolveOwnerSiteId(location.ownerType, location.ownerId),
    fetchPrimaryOwnerSlug(location),
  ])
  if (!siteId) {
    throw new ControlPlaneError(
      'not_found',
      `No Execution Site holds the storage this run works in (${location.ownerType} ${location.ownerId})`,
    )
  }

  return { agentId: claims.agentId, sessionId: claims.sessionId, siteId, location, ownerSlug }
}
