/**
 * What an upgrade may do, checked before anything changes and again when a scheduled one runs (spec §11): forward
 * only, to a published version, from images that were themselves published, and no further than the host service's
 * own major and minor version — a newer one needs the host service switched first (`hostService.ts`).
 */
import { installed, type Context } from '../service/context'
import { Refusal } from '../owner/results'
import { cmd } from '../cli/words'
import { isPublishedVersion } from '../images/published'
import { readUpgrades } from './settings'
import { compare, lineOf, sameLine } from './versions'

export type Target = 'hq' | 'site'

const NOTHING = 'Nothing was changed.'

/** `HQ`, or `the site hq-box`; capitalised at the start of a sentence. */
export function whoText(ctx: Context, target: Target, start = false): string {
  if (target === 'hq') return 'HQ'
  const name = installed(ctx).site?.settings.name ?? ctx.machine.name
  return `${start ? 'The' : 'the'} site ${name}`
}

/** The version the target runs now, refusing in words what cannot be upgraded at all. */
export function currentVersion(ctx: Context, target: Target): string {
  const here = installed(ctx)
  const part = here[target]
  if (!part) {
    throw new Refusal('not_installed', target === 'hq'
      ? `No HQ here: ${ctx.machine.name} runs no HQ. These commands run on HQ's own machine.`
      : `No site runs on ${ctx.machine.name}. To install HQ and its site here: ${cmd('install')}`)
  }
  const from = part.settings.version
  if (!isPublishedVersion(ctx.machine.hostServiceVersion) || !isPublishedVersion(from)) {
    throw new Refusal('conflict', `This host service is a development build, which runs images built on this machine: it is upgraded by building it again, not from published versions. ${NOTHING}`)
  }
  return from
}

/** The host service runs HQ and sites of its own major and minor version; a newer one is refused with how to go on. */
export function hostServiceBehind(ctx: Context, version: string): boolean {
  return !sameLine(version, ctx.machine.hostServiceVersion) && compare(version, ctx.machine.hostServiceVersion) > 0
}

/**
 * Refuses an upgrade that cannot go ahead, and says the version it starts from. An upgrade to `version` that is
 * under way (cut short by a restart) is let through, to be finished or put back.
 */
export function checkUpgrade(ctx: Context, target: Target, version: string, opts: { hostBehindOk?: boolean } = {}): string {
  const from = currentVersion(ctx, target)
  const underWay = readUpgrades(ctx.state).underWay
  if (underWay && underWay.target === target && underWay.to === version) return underWay.from
  const who = whoText(ctx, target, true)
  if (compare(version, from) === 0) throw new Refusal('conflict', `${who} is already on ${version}. ${NOTHING}`)
  if (compare(version, from) < 0) {
    throw new Refusal('conflict', `${who} is on ${from}, newer than ${version}. An upgrade only goes forward; to go back, restore a backup. ${NOTHING}`)
  }
  const hq = installed(ctx).hq
  if (target === 'site' && hq && compare(version, hq.settings.version) > 0) {
    throw new Refusal('conflict', `This site carries HQ, which is on ${hq.settings.version}, so it goes no further than HQ. Upgrade HQ, which upgrades its site with it: ${cmd(`hq upgrade ${version}`)}`)
  }
  if (!opts.hostBehindOk && hostServiceBehind(ctx, version)) {
    throw new Refusal('conflict', `${who === 'HQ' ? 'HQ' : 'The site'} ${version} needs the host service ${lineOf(version)} first; this one is ${ctx.machine.hostServiceVersion}. To get it ready and see how to switch to it: ${cmd(`${target} upgrade ${version}`)}`)
  }
  return from
}
