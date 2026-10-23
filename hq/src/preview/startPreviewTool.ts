/**
 * hq asks the site that holds the files to start a preview, and records where
 * the answer lives.
 *
 * Nothing here starts, names or reaches a container. A preview is a process
 * inside the boundary's own container on the site that holds it (ADR-0063), so
 * what hq contributes is the two things only hq knows — which boundary the run
 * works in, and the owner's name — and what it keeps is the row a token
 * resolves through: the site, and that site's own id for the preview.
 *
 * The address is a host of the preview's own under the install's preview
 * domain, on hq's own port (adr-0071): the site publishes no port and accepts
 * no inbound connection, so every preview is reached through hq, and never
 * from hq's own origin. With no preview domain, previews are off and this
 * refuses before anything is started.
 *
 * ## The refusals are translated, and raised as ControlPlaneError
 *
 * The site answers with a small vocabulary (`PreviewError`), and one of its
 * codes is not a fault at all: `no_container` means nothing is running in that
 * storage yet, which the person fixes by starting a run. Passing the wire
 * string through would hand a model and an operator `preview/no_container:`
 * and leave them to guess.
 *
 * Every one of those refusals is raised as a `ControlPlaneError`, and that is
 * load-bearing rather than tidy. An agent reaches this through the
 * control-plane forward (`server/controlplane/runtimeOps.ts` → `dataApi.ts`),
 * and `dataApi` answers a plain `Error` with `500 {"error":"internal error"}`
 * — deliberately, so a Prisma message or a file path cannot leak to a site. So
 * a plain `Error` here means the model is told "internal error" and nothing
 * else, for every case below: the translation would exist and never be read.
 * `ControlPlaneError` is what `dataApi` passes through with its message
 * intact.
 */
import { prisma } from 'wasp/server'
import { PREVIEW_METHODS, PreviewError } from '@agenthix/core'
import { ChannelRequestFailed } from '../sites/channel'
import type { SiteChannelRegistry } from '../sites/channel/siteChannelRegistry'
import { SiteUnreachableError, reasonFor } from '../storage/workspaceStore'
import { ControlPlaneError, type ControlPlaneErrorCode } from '../server/controlplane/types'
import { createPreview, markStatus } from './previewRegistry'
import type { PreviewBoundary } from './previewBoundary'
import { previewOrigin } from './previewWiring'
import { Logger } from '../server/utils/logger'
import { displaySiteName } from '../shared/siteName'

const logger = new Logger('Preview')

export interface StartPreviewDeps {
  /**
   * The boundary this run may preview, resolved from its verified claims.
   * Never a parameter — see `previewBoundary.ts` for why.
   */
  resolveTarget: () => Promise<PreviewBoundary>
  /** A control-channel request to one site. */
  request: SiteChannelRegistry['request']
  createPreview: typeof createPreview
  markStatus: typeof markStatus
  /** hq's own address — a preview host shares its scheme and port. */
  hqUrl: string
  /** The install's preview domain; null when previews are off. */
  previewDomain: string | null
  ttlMs: number
}

type SiteInfo = { label: string; status: string | null; protocolVersion: string | null }

/** Same shape and purpose as workspaceStore.ts's own private helper. */
async function siteInfoForLogicalSiteId(logicalSiteId: string): Promise<SiteInfo> {
  const site = await prisma.executionSite
    .findUnique({ where: { siteId: logicalSiteId }, select: { label: true, isDefault: true, status: true, protocolVersion: true } })
    .catch(() => null)
  return { label: site ? displaySiteName(site) : logicalSiteId, status: site?.status ?? null, protocolVersion: site?.protocolVersion ?? null }
}

/**
 * What to tell a person about each code the site can answer with, and which
 * kind of refusal it is.
 *
 * `conflict` for the three that are about the state of the world rather than
 * about the request: nothing is running there yet, the dev server did not come
 * up, the site could not exec. `invalid` and `not_found` keep their own
 * meanings, which are the same ones the control plane already uses for them.
 */
function readable(err: PreviewError, site: SiteInfo): { code: ControlPlaneErrorCode; message: string } {
  switch (err.code) {
    case 'no_container':
      // Not a fault, and the only code here that is somebody's next action
      // rather than somebody's bug.
      return {
        code: 'conflict',
        message: 'Nothing is running in this storage yet, so there is no container to preview in — start a run there first',
      }
    case 'not_ready':
      // The detail is the tail of the command's own output, which is the whole
      // difference between a preview somebody can fix and one they cannot.
      return { code: 'conflict', message: `The dev server started but never answered on that port.\n${err.detail}` }
    case 'not_found':
      return { code: 'not_found', message: `Execution Site "${site.label}" no longer has that preview` }
    case 'invalid':
      return { code: 'invalid', message: `Execution Site "${site.label}" could not resolve the storage this run works in` }
    case 'exec_failed':
      return { code: 'conflict', message: `Execution Site "${site.label}" could not start the preview — its own log says why` }
  }
}

async function translateFailure(siteId: string, err: unknown): Promise<never> {
  if (err instanceof ChannelRequestFailed) {
    if (err.code === 'offline' || err.code === 'timeout' || err.code === 'disconnected') {
      const site = await siteInfoForLogicalSiteId(siteId)
      // The wording is `SiteUnreachableError`'s, so there is one sentence for a
      // silent site across the whole of hq; the class is `ControlPlaneError` so
      // the sentence survives the forward.
      const unreachable = new SiteUnreachableError(site.label, siteId, reasonFor(site.status), site.protocolVersion)
      throw new ControlPlaneError('conflict', unreachable.message)
    }
  }
  if (err instanceof Error) {
    const fromSite = PreviewError.fromWire(err.message)
    if (fromSite) {
      const { code, message } = readable(fromSite, await siteInfoForLogicalSiteId(siteId))
      throw new ControlPlaneError(code, message)
    }
  }
  throw err
}

export async function runStartPreview(
  args: { command: string; port: number },
  deps: StartPreviewDeps,
): Promise<{ url: string; status: string }> {
  const domain = deps.previewDomain
  if (!domain) {
    throw new ControlPlaneError(
      'conflict',
      'Previews are off on this install: its operator has not set a preview domain (PREVIEW_DOMAIN), so a preview would have no address to be served from',
    )
  }
  const target = await deps.resolveTarget()

  let previewId: string
  try {
    const started = await deps.request(target.siteId, PREVIEW_METHODS.start, {
      location: {
        ownerType: target.location.ownerType,
        ownerId: target.location.ownerId,
        workspaceId: target.location.workspaceId ?? null,
        taskId: target.location.taskId ?? null,
      },
      ownerSlug: target.ownerSlug,
      sessionId: target.sessionId,
      command: args.command,
      port: args.port,
      ...(target.personalOwnerId ? { personalOwnerId: target.personalOwnerId } : {}),
    })
    previewId = started.previewId
  } catch (err) {
    return translateFailure(target.siteId, err)
  }

  let session: Awaited<ReturnType<typeof createPreview>>
  try {
    session = await deps.createPreview({
      agentId: target.agentId,
      sessionId: target.sessionId,
      siteId: target.siteId,
      previewId,
      command: args.command,
      ttlMs: deps.ttlMs,
      ownerType: target.location.ownerType,
      ownerId: target.location.ownerId,
      workspaceId: target.location.workspaceId ?? null,
      taskId: target.location.taskId ?? null,
    })
  } catch (err) {
    // The site is holding a dev server and, with it, that boundary's container
    // against idle teardown — and this `previewId` is about to be the only copy
    // there was, because no row exists to sweep it from later. Give it back
    // before the failure leaves.
    await deps
      .request(target.siteId, PREVIEW_METHODS.stop, { previewId })
      .catch((stopErr) => {
        logger.warn(
          `could not stop orphaned preview ${previewId} on site ${target.siteId}: ` +
            (stopErr instanceof Error ? stopErr.message : String(stopErr)),
        )
      })
    throw err
  }

  // `preview.start` returns only once the dev server has answered, so the row
  // is serving something the moment it exists. It is still created `starting`
  // and marked here, because that is the registry's own shape and the proxy
  // reads it.
  await deps.markStatus(session.id, 'running')

  return { url: `${previewOrigin(session.id, domain, deps.hqUrl)}/`, status: 'running' }
}
