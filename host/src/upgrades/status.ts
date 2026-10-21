/**
 * How upgrades stand on this machine, for `agenthix status` and `agenthix upgrades`: from what the registry last
 * said, kept by the last check, so reading it never waits on the network.
 */
import { installed, type Context } from '../service/context'
import { listScheduled } from '../scheduled/scheduler'
import { isPublishedVersion } from '../images/published'
import { upgradeTarget } from './automatic'
import { hostServiceBehind } from './rules'
import { launcherOn } from './hostService'
import { readSwitch } from '../launcher/journal'
import { readUpgrades, windowText } from './settings'
import { compare, isFixOf, newest } from './versions'

export type UpgradesStatus = {
  auto: boolean
  /** `Sunday 02:00–04:00`. */
  window: string
  target: 'hq' | 'site' | null
  current: string | null
  /** A newer published version of what runs here; null when there is none, or it is not known. */
  ready: null | {
    version: string
    fix: boolean
    /** It needs the host service switched to its version first. */
    hostServiceFirst: boolean
    /** It rolled back once, so it is not applied by itself again. */
    rolledBack: boolean
    /** When it is scheduled to run, if it is (ISO). */
    scheduledAt: string | null
  }
  /** A newer host service image, which the launcher, or the machine admin, switches to. */
  hostService: string | null
  /** Whether the host service switches itself, through the launcher (ADR-0118). */
  launcher: boolean
  /** The last switch of the host service, when it did not happen in the past week: to which version, when, and why. */
  hostSwitchFailed: { version: string; endedAt: string; reason: string } | null
  /** Why whether an upgrade is ready is not known; null when the last check read the registry. */
  problem: string | null
  checkedAt: string | null
  /** The last upgrade, when it was rolled back in the past week: when, and why. */
  rolledBackLately: { version: string; endedAt: string; reason: string } | null
}

const LATELY_MS = 7 * 24 * 3600_000

function switchFailedLately(ctx: Context): UpgradesStatus['hostSwitchFailed'] {
  const s = readSwitch(ctx.state)
  if (!s || (s.phase !== 'failed' && s.phase !== 'refused') || !s.endedAt || !s.reason) return null
  return ctx.now().getTime() - Date.parse(s.endedAt) < LATELY_MS ? { version: s.to, endedAt: s.endedAt, reason: s.reason } : null
}

export function upgradesStatus(ctx: Context): UpgradesStatus {
  const s = readUpgrades(ctx.state)
  const target = upgradeTarget(ctx)
  const current = target ? installed(ctx)[target]!.settings.version : null
  const host = ctx.machine.hostServiceVersion
  const published = (v: string | null | undefined): v is string => !!v && isPublishedVersion(v)
  let ready: UpgradesStatus['ready'] = null
  const versions = s.lastCheck?.versions ?? []
  // A fix comes first: it is what applies by itself, while a new version waits to be asked for.
  const newer = published(current)
    ? newest(versions.filter(v => isFixOf(v, current) && (!published(host) || !hostServiceBehind(ctx, v)))) ?? newest(versions)
    : null
  if (target && published(current) && published(newer) && compare(newer, current) > 0) {
    const scheduled = listScheduled(ctx).find(c => c.kind === 'upgrade' && c.target === target)
    ready = {
      version: newer,
      fix: isFixOf(newer, current),
      hostServiceFirst: published(host) && hostServiceBehind(ctx, newer),
      rolledBack: s.rolledBack.includes(`${target}@${newer}`),
      scheduledAt: scheduled?.at ?? null,
    }
  }
  const newestHost = s.lastCheck?.host
  return {
    auto: s.auto,
    window: windowText(s.window),
    target,
    current,
    ready,
    hostService: published(host) && published(newestHost) && compare(newestHost, host) > 0 ? newestHost : null,
    launcher: launcherOn(ctx),
    hostSwitchFailed: switchFailedLately(ctx),
    problem: s.lastCheck?.problem ?? null,
    checkedAt: s.lastCheck?.at ?? null,
    rolledBackLately: s.last?.rolledBack && s.last.target === target && s.last.reason && ctx.now().getTime() - Date.parse(s.last.endedAt) < LATELY_MS
      ? { version: s.last.to, endedAt: s.last.endedAt, reason: s.last.reason }
      : null,
  }
}
