/**
 * How hq and the Fleet Console hear of a scheduled change (host-management spec §14, diagram 6).
 *
 * hq: on hq's machine, through hq's private control socket — the same local route as recovery; on a site's machine,
 * from the site, which reads the notices with the machine's figures and passes them up its channel to hq. Only the
 * newest notice of each change is kept. On hq's machine it is sent until hq answers; a site is not asked to
 * confirm, so it is offered every notice still held, and hq keeps whichever is newest.
 *
 * The Fleet Console: each new notice is sealed to the Fleet Console this machine pins and sent over the link, like
 * every envelope the machine sends it; one the link was down for is sent once it is up. It keeps them in memory
 * only, so every notice still held is offered again whenever it reads the machine's figures (`link/envelopes.ts`).
 */
import type { ScheduledChangeNotice } from '@agenthix/core'
import { sealEnvelope } from '@agenthix/core/host-crypto'
import { installed, type Context } from '../service/context'
import type { StateFolder } from '../state/folder'
import { hostKeys } from '../identity/identity'
import { readPin } from '../link/pin'
import { readStore, withStore } from './store'

/** hq's control socket command that takes a notice. */
export const HQ_NOTICE_COMMAND = 'scheduled-change'

/** At most this many notices are offered again at a figures read, the newest. */
const OFFERED_AT_MOST = 50

const deliveries = new Map<string, Promise<void>>()

/**
 * Sends the Fleet Console and hq every notice each has not taken; stops at the first hq does not answer, to try
 * again on the next tick. One delivery at a time per machine, so a notice is not sent twice by two callers at once.
 */
export function deliverNotices(ctx: Context): Promise<void> {
  const root = ctx.state.root
  const run = async () => {
    await tellConsole(ctx).catch(() => {})
    await tellHq(ctx)
  }
  const next = (deliveries.get(root) ?? Promise.resolve()).then(run, run)
  deliveries.set(root, next)
  void next.finally(() => { if (deliveries.get(root) === next) deliveries.delete(root) }).catch(() => {})
  return next
}

async function tellConsole(ctx: Context): Promise<void> {
  const pin = readPin(ctx.state)
  if (!pin || !ctx.link?.connected()) return
  const untold = readStore(ctx.state).entries.filter(e => e.notice && !e.toldConsole).map(e => e.notice as ScheduledChangeNotice)
  if (untold.length === 0) return
  const keys = await hostKeys(ctx.state)
  for (const notice of untold) {
    const message = { kind: 'scheduledChange' as const, notice }
    ctx.link.sendEnvelope(await sealEnvelope({ sender: keys, recipient: pin.console, message, now: ctx.now().getTime() }))
  }
  await withStore(ctx.state, file => {
    for (const notice of untold) {
      const entry = file.entries.find(e => e.change.id === notice.change.id)
      if (entry && entry.notice?.sentAt === notice.sentAt) entry.toldConsole = true
    }
  })
}

async function tellHq(ctx: Context): Promise<void> {
  if (!installed(ctx).hq) return
  const pending = readStore(ctx.state).entries.filter(e => e.notice && !e.delivered).map(e => e.notice as ScheduledChangeNotice)
  for (const notice of pending) {
    const answer = await ctx.hqControl.run(HQ_NOTICE_COMMAND, [JSON.stringify(notice)])
    if (!answer) return
    // Any answer is final: hq refusing a notice will refuse it again, and an older hq does not know the command.
    await withStore(ctx.state, file => {
      const entry = file.entries.find(e => e.change.id === notice.change.id)
      if (entry && entry.notice?.sentAt === notice.sentAt) entry.delivered = true
    })
  }
}

/** Every notice still held, newest first, for the Fleet Console when it reads the figures. */
export function heldNotices(state: StateFolder): ScheduledChangeNotice[] {
  return readStore(state).entries
    .flatMap(e => (e.notice ? [e.notice] : []))
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
    .slice(0, OFFERED_AT_MOST)
}

/** What the site on this machine passes up to hq. None on hq's machine, where hq hears through its control socket. */
export function noticesForSite(ctx: Context): ScheduledChangeNotice[] {
  if (installed(ctx).hq) return []
  return readStore(ctx.state).entries.flatMap(e => (e.notice ? [e.notice] : []))
}

/** How many changes are ahead or running, for the machine's figures. */
export function scheduledCount(ctx: Context): number {
  return readStore(ctx.state).entries.filter(e => !e.endedAt).length
}
