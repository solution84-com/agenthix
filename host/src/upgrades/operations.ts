/**
 * Upgrades as the owner socket and the scheduler take them (spec §11, §14). `upgrade` is core's closed set, which a
 * controller may also ask; the `upgrades.*` requests stay on the machine: what is ready, readying the host
 * service's own image or switching to it (ADR-0118), and turning automatic fixes or the launcher on or off, or
 * moving the fixes' window.
 *
 * Importing this module registers the upgrade as a change the scheduler runs.
 */
import { installed, type Context } from '../service/context'
import { Refusal } from '../owner/results'
import { registerScheduledChange } from '../scheduled/registry'
import { isPublishedVersion } from '../images/published'
import { checkPublished, setUpgrades } from './automatic'
import { launcherOn, moveHostServiceFirst, readyHostService, switchHostService, type HostServiceReady } from './hostService'
import { readyBuiltHostService, switchBuiltHostService } from './builtHostService'
import { checkUpgrade, currentVersion, hostServiceBehind, whoText, type Target } from './rules'
import { parseWindow, writeUpgrades } from './settings'
import { upgradesStatus, type UpgradesStatus } from './status'
import { upgrade, type UpgradeOutcome } from './upgrade'
import { IMAGE_TAG } from './builtUpgrade'
import { DEVELOPMENT } from '../images/ownVersion'
import type { Progress } from '../sockets/lineServer'
import { compare, newest } from './versions'

export type UpgradesMachineRequest =
  | { op: 'upgrades.status' }
  /** Which version an upgrade of `target` goes to (the newest published, unless one is named), before it is asked. */
  | { op: 'upgrades.check'; target: Target; version?: string }
  /** `built`, never with `version`: a development build's switch to an image built on the machine, by its name or id. */
  | { op: 'upgrades.hostService'; version?: string; built?: string }
  /** Switches the host service to its newest published version, or `version`, or `built`, through the launcher. */
  | { op: 'upgrades.hostSwitch'; version?: string; built?: string }
  | { op: 'upgrades.set'; auto?: boolean; window?: string; launcher?: boolean }
  /** A development build's upgrade, at once, to the images built here under `tag` (`builtUpgrade.ts`). */
  | { op: 'upgrades.built'; target: Target; tag: string }

export type UpgradeCheckResult = {
  target: Target
  /** `HQ`, or `The site hq-box`. */
  who: string
  from: string
  /** null when what runs is the newest published version. */
  version: string | null
  hostServiceFirst: boolean
  /** Whether the host service moves itself first, through the launcher, or is switched by hand. */
  launcher: boolean
}

/** The launcher has started: this host service is stopped shortly, and the new one carries on. */
export type HostSwitchStarted = { from: string; version: string }

const target = (v: unknown): Target | null => (v === 'hq' || v === 'site' ? v : null)
const version = (v: unknown): string | undefined | null => (v === undefined ? undefined : typeof v === 'string' && isPublishedVersion(v) ? v : null)
/** A local image's name or id, as Docker writes one; never anything Docker would read as an option. */
const LOCAL_IMAGE = /^[A-Za-z0-9][A-Za-z0-9._/:@-]{0,254}$/
const builtImage = (v: unknown): string | undefined | null => (v === undefined ? undefined : typeof v === 'string' && LOCAL_IMAGE.test(v) ? v : null)

/** The machine's own upgrade requests, rebuilt field by field; null when the op is not one of them. */
export function parseUpgradesRequest(r: Record<string, unknown>): UpgradesMachineRequest | 'malformed' | null {
  switch (r.op) {
    case 'upgrades.status':
      return { op: r.op }
    case 'upgrades.check': {
      const t = target(r.target)
      const v = version(r.version)
      return t && v !== null ? { op: r.op, target: t, version: v } : 'malformed'
    }
    case 'upgrades.hostService':
    case 'upgrades.hostSwitch': {
      const v = version(r.version)
      const built = builtImage(r.built)
      if (v === null || built === null || (v !== undefined && built !== undefined)) return 'malformed'
      return built === undefined ? { op: r.op, version: v } : { op: r.op, built }
    }
    case 'upgrades.set': {
      if (r.auto !== undefined && typeof r.auto !== 'boolean') return 'malformed'
      if (r.launcher !== undefined && typeof r.launcher !== 'boolean') return 'malformed'
      if (r.window !== undefined && (typeof r.window !== 'string' || r.window.length > 64)) return 'malformed'
      if (r.auto === undefined && r.window === undefined && r.launcher === undefined) return 'malformed'
      return { op: r.op, auto: r.auto as boolean | undefined, window: r.window as string | undefined, launcher: r.launcher as boolean | undefined }
    }
    case 'upgrades.built': {
      const t = target(r.target)
      return t && typeof r.tag === 'string' && IMAGE_TAG.test(r.tag) ? { op: r.op, target: t, tag: r.tag } : 'malformed'
    }
    default:
      return null
  }
}

async function check(ctx: Context, t: Target, wanted?: string): Promise<UpgradeCheckResult> {
  const from = currentVersion(ctx, t)
  let to = wanted
  if (!to) {
    const { check: last } = await checkPublished(ctx)
    if (last.problem) throw new Refusal('failed', last.problem)
    const hq = installed(ctx).hq
    const newer = (last.versions ?? []).filter(v => compare(v, from) > 0 && (t === 'hq' || !hq || compare(v, hq.settings.version) <= 0))
    // What the host service runs now comes first; a version that needs it switched is offered once nothing else is.
    to = newest(newer.filter(v => !hostServiceBehind(ctx, v))) ?? newest(newer) ?? undefined
    if (!to) return { target: t, who: whoText(ctx, t, true), from, version: null, hostServiceFirst: false, launcher: launcherOn(ctx) }
  }
  checkUpgrade(ctx, t, to, { hostBehindOk: true })
  return { target: t, who: whoText(ctx, t, true), from, version: to, hostServiceFirst: hostServiceBehind(ctx, to), launcher: launcherOn(ctx) }
}

export async function upgradesOperation(
  ctx: Context, request: UpgradesMachineRequest, progress: (p: Progress) => void = () => {},
): Promise<UpgradesStatus | UpgradeCheckResult | HostServiceReady | HostSwitchStarted | UpgradeOutcome> {
  switch (request.op) {
    case 'upgrades.built':
      return upgrade(ctx, request.target, DEVELOPMENT, progress, { built: request.tag })
    case 'upgrades.status':
      return upgradesStatus(ctx)
    case 'upgrades.check':
      return check(ctx, request.target, request.version)
    case 'upgrades.hostService':
      return request.built === undefined ? readyHostService(ctx, request.version) : readyBuiltHostService(ctx, request.built)
    case 'upgrades.hostSwitch': {
      const { ready, ended } = request.built === undefined ? await switchHostService(ctx, request.version) : await switchBuiltHostService(ctx, request.built)
      // Settles only if the switch ends without stopping this host service; status says how it went.
      void ended.catch(() => {})
      return { from: ready.from, version: ready.version }
    }
    case 'upgrades.set': {
      const window = request.window === undefined ? undefined : parseWindow(request.window)
      if (window && 'problem' in window) throw new Refusal('malformed', `${window.problem} Nothing was changed.`)
      if (request.launcher !== undefined) writeUpgrades(ctx.state, s => { s.launcher = request.launcher! })
      if (request.auto !== undefined || window) await setUpgrades(ctx, { auto: request.auto, window })
      return upgradesStatus(ctx)
    }
  }
}

registerScheduledChange('upgrade', {
  kind: 'upgrade',
  target: r => r.target,
  detail: (_ctx, r) => r.version,
  expectedMinutes: 20,
  holdsMachine: true,
  // A version that needs the host service moved first can be scheduled while the launcher can move it.
  check: (ctx, r) => { checkUpgrade(ctx, r.target, r.version, { hostBehindOk: launcherOn(ctx) }) },
  run: async (ctx, r, waiting) => {
    if (hostServiceBehind(ctx, r.version)) await moveHostServiceFirst(ctx, r.version)
    const outcome = await upgrade(ctx, r.target, r.version, () => {}, { onBusy: waiting })
    if (outcome.rolledBack) throw new Error(outcome.reason)
  },
})
