/**
 * A machine that disconnects itself tells HQ it left (host-management spec §6), with or without a site. Each part
 * leaves with its own credential, whose only effect is to retire itself: the machine with its machine credential at
 * HQ's host-leave endpoint (HQ lists it as having left by itself), and its site, when it carries one of its own, with
 * the site's credential at the site-leave endpoint (ADR-0065). Both go to the address the machine's link was using —
 * the pin's, read before it is forgotten — not the site's recorded one, which may be older. At once when HQ answers;
 * otherwise a one-use notice stays in the state folder and the host service delivers it when HQ answers again. Each
 * part goes from the notice once HQ has answered it, and its credential with it.
 *
 * The site's credential moves into the notice at disconnect: the site's own copy is deleted and its compose file
 * rewritten without it, so a stopped site that starts again cannot reconnect. The notice, like everything in the
 * state folder, is readable by the owner only.
 */
import fs from 'node:fs'
import { HOST_LEAVE_PATH, SITE_LEAVE_PATH } from '@agenthix/core'
import { installed, type Context } from '../service/context'
import { composeJson } from '../compose/projects'
import { installSecrets } from '../state/secrets'
import type { StateFolder } from '../state/folder'
import { readSiteCredential, siteComposeProject } from '../install/siteCompose'
import { awaitingSite, sendOf } from '../move/record'
import type { ConsolePin } from './pin'
import { installSubnets } from '../compose/subnets'

const FILE = ['link', 'leaving.json']
const SITE_CREDENTIAL = ['site', 'credential.json']

export type LeavingNotice = {
  hqAddress: string
  leftAt: string
  /** The machine's credential to HQ's relay, until HQ has answered its leave. */
  machineCredential?: string
  /** The site's own credential, until HQ has answered its leave. */
  site?: { credential: string; name: string }
}

/**
 * Per part — `told`: HQ took the leave. `gone`: HQ no longer knows the credential (a fleet admin removed it first), or
 * will never let it leave. Either way that part is used. `kept`: HQ did not answer, or answered with a fault; it waits.
 */
export type PartDelivery = 'told' | 'gone' | 'kept'
export type LeaveDelivery = 'none' | { machine: PartDelivery | null; site: PartDelivery | null }

export type Post = (url: URL, init: RequestInit) => Promise<{ status: number; ok: boolean }>

const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max

export function readLeavingNotice(state: StateFolder): LeavingNotice | null {
  try {
    const v = state.readJson(...FILE) as Partial<LeavingNotice> | null
    if (!v || !text(v.hqAddress, 512) || !text(v.leftAt, 64)) return null
    const machineCredential = text(v.machineCredential, 512) ? v.machineCredential : undefined
    const site = v.site && text(v.site.credential, 512) && text(v.site.name, 128) ? { credential: v.site.credential, name: v.site.name } : undefined
    if (!machineCredential && !site) return null
    return { hqAddress: v.hqAddress, leftAt: v.leftAt, ...(machineCredential ? { machineCredential } : {}), ...(site ? { site } : {}) }
  } catch {
    return null
  }
}

/**
 * Whether the site's credential is this machine's to leave with. Once a move released it to another machine, it is
 * that machine's; while a move brings a site here, the site may still go back where it came from.
 */
function credentialIsOurs(ctx: Context): boolean {
  // A move of what runs here now; one of an earlier install left with what it moved.
  const sent = (sendOf(ctx, 'site') ?? sendOf(ctx, 'hq'))?.phase
  if (sent === 'released' || sent === 'committed' || sent === 'removed') return false
  return awaitingSite(ctx.state) === null
}

/**
 * At `console disconnect`, after the pin is gone (`pin` is what it held): keeps the one-use notice and takes the
 * credential away from the site. Null only when the notice could not be kept. Never throws: nothing may hold up
 * leaving.
 */
export async function noteLeaving(ctx: Context, pin: ConsolePin): Promise<LeavingNotice | null> {
  const site = installed(ctx).site
  const credential = site?.settings.hqUrl ? readSiteCredential(ctx.state) : null
  const ours = credential && credentialIsOurs(ctx) ? { credential, name: site!.settings.name } : undefined
  const notice: LeavingNotice = {
    hqAddress: pin.hqAddress, leftAt: ctx.now().toISOString(), machineCredential: pin.machineCredential, ...(ours ? { site: ours } : {}),
  }
  try {
    ctx.state.writeJson(FILE, notice)
  } catch {
    // The pin is gone already; without the notice HQ shows the machine as not heard from, and the site keeps its credential.
    return null
  }
  if (!ours || !site) return notice
  try {
    fs.rmSync(ctx.state.path(...SITE_CREDENTIAL), { force: true })
    const paths = await ctx.machinePaths()
    if (paths) {
      ctx.state.writePrivate(['site', 'compose.json'], composeJson(siteComposeProject(ctx.state, ctx.names, site.settings, installSecrets(ctx.state), paths, await installSubnets(ctx))))
    }
  } catch {
    // The site is stopped already; a compose file not rewritten is replaced by the next install or removal.
  }
  return notice
}

const defaultPost: Post = (url, init) => fetch(url, init)

let delivering: Promise<LeaveDelivery> | null = null

/** Delivers the notice if one waits; one delivery at a time. */
export function deliverLeaving(state: StateFolder, post: Post = defaultPost, timeoutMs = 5_000): Promise<LeaveDelivery> {
  if (delivering) return delivering
  delivering = deliver(state, post, timeoutMs).finally(() => { delivering = null })
  return delivering
}

async function leave(post: Post, address: string, path: string, credential: string, timeoutMs: number): Promise<PartDelivery> {
  let status: number
  try {
    const res = await post(new URL(path, address), {
      method: 'POST',
      headers: { Authorization: `Bearer ${credential}` },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error',
    })
    status = res.ok ? 200 : res.status
  } catch {
    return 'kept'
  }
  // 401: HQ does not know the credential any more; 409: one HQ will never let leave. Neither changes by asking again.
  if (status === 200) return 'told'
  return status === 401 || status === 409 ? 'gone' : 'kept'
}

async function deliver(state: StateFolder, post: Post, timeoutMs: number): Promise<LeaveDelivery> {
  const notice = readLeavingNotice(state)
  if (!notice) return 'none'
  // The site first, so a machine HQ lists as having left carries no site that still takes part.
  const site = notice.site ? await leave(post, notice.hqAddress, SITE_LEAVE_PATH, notice.site.credential, timeoutMs) : null
  const machine = notice.machineCredential ? await leave(post, notice.hqAddress, HOST_LEAVE_PATH, notice.machineCredential, timeoutMs) : null
  // Only the parts it delivered: a notice written since, by a later disconnect, is that disconnect's to deliver.
  const now = readLeavingNotice(state)
  if (now) {
    const rest: LeavingNotice = { hqAddress: now.hqAddress, leftAt: now.leftAt }
    if (now.machineCredential && !(machine && machine !== 'kept' && now.machineCredential === notice.machineCredential)) rest.machineCredential = now.machineCredential
    if (now.site && !(site && site !== 'kept' && now.site.credential === notice.site?.credential)) rest.site = now.site
    if (!rest.machineCredential && !rest.site) fs.rmSync(state.path(...FILE), { force: true })
    else state.writeJson(FILE, rest)
  }
  return { machine, site }
}

/** Whether HQ heard it: `notYet` while a part waits, `told` once HQ took any leave, else HQ had removed them first. */
export function leaveOutcome(d: LeaveDelivery): 'told' | 'alreadyRemoved' | 'notYet' | null {
  if (d === 'none') return null
  if (d.machine === 'kept' || d.site === 'kept') return 'notYet'
  return d.machine === 'told' || d.site === 'told' ? 'told' : 'alreadyRemoved'
}

/** The host service's loop: tries a waiting notice every `intervalMs` until HQ answers it. */
export function startLeavingNotices(state: StateFolder, intervalMs: number, log: (line: string) => void, post: Post = defaultPost): () => void {
  const tick = () => {
    void deliverLeaving(state, post).then(r => {
      if (r !== 'none' && r.site === 'told') log('HQ was told this machine left: its site no longer takes part.')
      else if (r !== 'none' && r.machine === 'told') log('HQ was told this machine left.')
    }, () => {})
  }
  tick()
  const timer = setInterval(tick, intervalMs)
  timer.unref?.()
  return () => clearInterval(timer)
}
