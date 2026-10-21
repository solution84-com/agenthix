/**
 * A restored site renews its credential at HQ before it starts (adr-0119): its host service presents the credential
 * the backup carried, with its own machine credential, and the hash of a new credential made here. HQ accepts only
 * while no machine is connected as the site, and only from the machine a fleet admin confirmed with a code for
 * restoring it; from then on the backup's credential is refused, so the machine the site ran on is refused if it
 * comes back. The new credential never leaves this machine.
 *
 * Asked again after no answer, with the new credential: HQ that took the first answers that the site is already
 * renewed to it, so a lost answer does not lose the site.
 */
import crypto from 'node:crypto'
import { SITE_RESTORE_MACHINE_HEADER, SITE_RESTORE_RENEW_PATH, type SiteRestoreRenewed } from '@agenthix/core'
import type { Context } from '../service/context'

export type RenewPost = (url: URL, init: RequestInit) => Promise<{ status: number; json: () => Promise<unknown> }>

const posts = new WeakMap<Context, RenewPost>()

/** Tests stand in for HQ here. */
export function setRenewPost(ctx: Context, post: RenewPost): void {
  posts.set(ctx, post)
}

export type Renewal =
  | { ok: true; renewed: SiteRestoreRenewed }
  /** HQ refused, in its words; nothing changed there. */
  | { ok: false; refused: string }
  /** HQ did not answer, or not in a way that can be read: whether it renewed is not known. */
  | { ok: false; unknown: string }

export const credentialHash = (credential: string) => crypto.createHash('sha256').update(credential).digest('hex')

const ATTEMPTS = 3

export type RenewOptions = {
  hqAddress: string
  machineCredential: string
  backupCredential: string
  timeoutMs?: number
} & ({ check: true } | { newCredential: string })

/** `check`: HQ only says whether it would renew, and changes nothing. */
export async function renewAtHq(ctx: Context, o: RenewOptions): Promise<Renewal> {
  const post = posts.get(ctx) ?? ((url, init) => fetch(url, init))
  const body = JSON.stringify('check' in o ? { check: true } : { credentialHash: credentialHash(o.newCredential) })
  const again = 'check' in o ? [] : [o.newCredential]
  let unanswered = false
  let last = 'HQ did not answer'
  for (let i = 0; i < ATTEMPTS; i++) {
    // After an answer that was lost, HQ may hold the new credential already: it says so to that one alone.
    for (const bearer of unanswered ? [o.backupCredential, ...again] : [o.backupCredential]) {
      let status: number
      let answer: unknown
      try {
        const res = await post(new URL(SITE_RESTORE_RENEW_PATH, o.hqAddress), {
          method: 'POST',
          headers: { Authorization: `Bearer ${bearer}`, [SITE_RESTORE_MACHINE_HEADER]: o.machineCredential, 'Content-Type': 'application/json' },
          body,
          signal: AbortSignal.timeout(o.timeoutMs ?? 15_000),
          redirect: 'error',
        })
        status = res.status
        answer = await res.json().catch(() => null)
      } catch (err) {
        unanswered = true
        last = `HQ did not answer at ${o.hqAddress}: ${err instanceof Error ? err.message : String(err)}`
        break
      }
      const a = (answer ?? {}) as Record<string, unknown>
      if (status === 200 && typeof a.executionSiteId === 'string' && typeof a.siteName === 'string') {
        return { ok: true, renewed: { executionSiteId: a.executionSiteId, siteName: a.siteName } }
      }
      if (status === 401 && bearer === o.backupCredential && unanswered && again.length) continue
      if (status === 401 || status === 409 || status === 403) {
        const words = typeof a.error === 'string' && a.error ? a.error.slice(0, 500) : "HQ does not know the site's credential from this backup: the site was removed from HQ, or was restored elsewhere since this backup was taken"
        return { ok: false, refused: words.replace(/[.\s]+$/, '') }
      }
      unanswered = true
      last = `HQ answered ${status}`
      break
    }
    if (i < ATTEMPTS - 1) await ctx.sleep(1_000 * (i + 1))
  }
  return { ok: false, unknown: last }
}
