/**
 * What an upgrade checks it can write before anything stops: the compose files of the version it goes to, and of the
 * version it would put back. A file that cannot be written would leave HQ or the site stopped with no way forward and
 * none back, so the upgrade is refused while everything still runs as it was.
 */
import type { MachinePaths } from '../compose/projects'
import { installed, type Context } from '../service/context'
import { Refusal } from '../owner/results'
import { cmd } from '../cli/words'
import { installationOf } from '../state/installation'
import { composeFiles } from './rollback'
import type { Target } from './rules'

const NOTHING = 'Nothing was changed.'

/** What the installation's record lacks that writing the projects needs, in words; empty when it lacks nothing. */
function recordGaps(ctx: Context, target: Target): string[] {
  const installation = installationOf(ctx.state)
  return [
    ...(target === 'hq' && installation.ports.hq === null ? ["HQ's published port"] : []),
    ...(installation.agentRange === null ? ["its agents' address range"] : []),
  ]
}

/** How the record is filled in: `install` run again, which records what it finds missing. None on a machine without HQ. */
function fillIn(ctx: Context): string {
  const hq = installed(ctx).hq
  return hq ? ` To record it, run install again, which changes nothing that is set: ${cmd(`install --address ${hq.settings.address}`)} Then upgrade.` : ''
}

export async function refuseUnwritable(ctx: Context, target: Target, version: string, paths: MachinePaths): Promise<void> {
  const gaps = recordGaps(ctx, target)
  if (gaps.length) {
    throw new Refusal('failed', `Not upgraded: this installation's record (installation.json) does not hold ${gaps.join(' or ')}, ` +
      `which the host service needs to write ${target === 'hq' ? "HQ's and its site's" : "the site's"} services. ` +
      `It was installed by an older host service.${fillIn(ctx)} ${NOTHING}`)
  }
  const here = installed(ctx)
  const hq = target === 'hq' ? here.hq?.settings ?? null : null
  const site = here.site!.settings
  try {
    await composeFiles(ctx, hq ? { ...hq, version, images: undefined } : null, { ...site, version, images: undefined }, paths)
    await composeFiles(ctx, hq, site, paths)
  } catch (err) {
    if (err instanceof Refusal) throw err
    const why = err instanceof Error ? err.message : String(err)
    throw new Refusal('failed', `Not upgraded: the host service could not write the services to start, or to go back to: ${why.replace(/\.?$/, '.')} ${NOTHING}`)
  }
}
