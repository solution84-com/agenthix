import type { PreviewSession } from 'wasp/entities'
import { PREVIEW_METHODS } from '@agenthix/core'
import { siteChannelRegistry } from '../sites/channel'
import { listExpired, markStatus } from './previewRegistry'
import { Logger } from '../server/utils/logger'

const logger = new Logger('Preview')

export interface SweepDeps {
  listExpired: typeof listExpired
  /** Ask the site holding a preview to stop it. */
  stop: (row: Pick<PreviewSession, 'siteId' | 'previewId'>) => Promise<void>
  markStatus: typeof markStatus
}

/**
 * Stop every preview past its expiry, and let go of the row only once the site
 * has said it is stopped.
 *
 * ## Why an unacknowledged stop keeps the row
 *
 * A running preview HOLDS its container on the site: the idle sweep, both
 * orphan-removal branches and `stopAgent` all skip a container with a preview
 * in it, and `preview.stop` is the only thing that gives the hold back. So a
 * site that does not answer this call is not a case that heals — the container
 * stays pinned open and the dev server stays up until somebody stops that
 * preview by name, and this row holds the only copy of the name.
 *
 * Marking the row `expired` on a failed stop would throw that name away and
 * take the row out of `listExpired`'s candidate set in the same breath, so hq
 * would never try again. Instead the row moves to `stopping`: a token stops
 * resolving through it immediately (`previewAuth.ts`), and it stays in the
 * candidate set, so the next sweep asks again — and keeps asking until the
 * site answers. A site that restarted in the meantime answers
 * `{ stopped: false }` rather than failing, which ends the retry correctly.
 *
 * Returns how many rows the sweep handled, stopped or not.
 */
export async function sweepOnce(now: Date, deps: SweepDeps): Promise<number> {
  const expired = await deps.listExpired(now)
  for (const s of expired) {
    try {
      await deps.stop(s)
    } catch (err) {
      // Logged rather than swallowed: this is the only trace of a preview hq
      // has given up reaching, and it is what an investigation into a
      // container that will not go idle starts from. It also keeps a
      // programming error in this path from being invisible.
      logger.warn(
        `could not stop preview ${s.previewId} on site ${s.siteId}, will retry: ` +
          (err instanceof Error ? err.message : String(err)),
      )
      await deps.markStatus(s.id, 'stopping')
      continue
    }
    await deps.markStatus(s.id, 'expired')
  }
  return expired.length
}

let timer: NodeJS.Timeout | null = null

export function startPreviewSweep(intervalMs = 60_000): void {
  if (timer) return
  timer = setInterval(() => {
    sweepOnce(new Date(), {
      listExpired,
      stop: async (row) => {
        await siteChannelRegistry.request(row.siteId, PREVIEW_METHODS.stop, { previewId: row.previewId })
      },
      markStatus,
    }).catch((e) => logger.error('sweep error', e))
  }, intervalMs)
  timer.unref?.()
}
