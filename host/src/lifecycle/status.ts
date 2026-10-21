/** What `status` says of suspensions and erases (host-management spec §15): what is suspended, and what the bin holds. */
import type { HostTarget } from '@agenthix/core'
import { installed, type Context } from '../service/context'
import { binEntries } from './bin'
import { suspended, type Suspended } from './suspend'

export type ErasedStatus = {
  target: HostTarget
  hqAddress: string | null
  siteName: string
  erasedAt: string
  purgeAfter: string
  purgeProblem: string | null
}

export type LifecycleStatus = { suspended: Suspended; erased: ErasedStatus[] }

/**
 * What the bin holds is told only while nothing runs here: it comes back only onto an empty machine, and once a new
 * HQ or site runs here — installed, moved or restored — the machine reports only what it holds. The bin keeps it for
 * its grace period all the same.
 */
export function lifecycleStatus(ctx: Context): LifecycleStatus {
  const { hq, site } = installed(ctx)
  return {
    suspended: suspended(ctx),
    erased: hq || site ? [] : binEntries(ctx).map(e => ({
      target: e.target, hqAddress: e.hqAddress, siteName: e.siteName, erasedAt: e.erasedAt, purgeAfter: e.purgeAfter,
      purgeProblem: e.purgeProblem ?? null,
    })),
  }
}
