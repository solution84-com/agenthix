/**
 * `agenthix site hq-address <address>`, or the Fleet Console's `address.set` for the site (host-management spec §13):
 * a site that was offline while hq moved is pointed at its new address. The move check runs first, on the site's
 * credential, which this machine made and keeps; only when it passes is the site started again with the new
 * address. An address that fails it is sent nothing more, and the site is left as it was.
 */
import type { MoveCheckOutcome } from '@agenthix/core'
import { runMoveCheck, type MoveCheckOptions } from '@agenthix/core/host-crypto'
import type { Progress } from '../sockets/lineServer'
import { composeJson } from '../compose/projects'
import { installed, type Context, type StoredSite } from '../service/context'
import { installSecrets } from '../state/secrets'
import { Refusal } from '../owner/results'
import { cmd } from '../cli/words'
import { CHECK_STEP, checkStepOutcome, checking, notChanged } from '../cli/hqAddressWords'
import { hqAddressProblem } from '../link/socket'
import { readSiteCredential, siteComposeProject } from './siteCompose'
import { installSubnets } from '../compose/subnets'

export type SiteAddressResult = { siteName: string; address: string; previous: string }

type Check = (o: MoveCheckOptions) => Promise<MoveCheckOutcome>

export async function pointSite(ctx: Context, raw: string, progress: (p: Progress) => void, check: Check = runMoveCheck): Promise<SiteAddressResult> {
  const address = raw.trim().replace(/\/+$/, '')
  const here = installed(ctx)
  if (!here.site) throw new Refusal('not_installed', `No site runs on ${ctx.machine.name}.`)
  const site = here.site.settings
  if (here.hq || !site.hqUrl) {
    throw new Refusal('conflict', `The site here is HQ's own: it reaches HQ over a private Docker network on this machine, so it has no address to set. To change HQ's address: ${cmd('hq address <address>')}`)
  }
  const problem = hqAddressProblem(address)
  if (problem) throw new Refusal('malformed', `HQ cannot be reached at ${address}: ${problem}.`)
  const credential = readSiteCredential(ctx.state)
  if (!credential) {
    throw new Refusal('failed', `The site ${site.name} holds no credential on this machine, so it cannot prove itself to any HQ. A fleet admin adds it again in the Fleet Console.`)
  }
  const paths = await ctx.machinePaths()
  if (!paths) throw new Refusal('failed', 'The host service cannot find its state folder on this machine. Nothing was changed.')
  const who = { kind: 'site', name: site.name } as const

  progress({ event: 'note', text: `The site ${site.name} uses HQ at ${site.hqUrl}.` })
  progress({ event: 'note', text: checking(address, who) })
  progress({ event: 'step', step: CHECK_STEP })
  const outcome = await check({ address, credential, subject: 'site' })
  progress({ event: 'stepDone', outcome: checkStepOutcome(outcome) })
  if (outcome !== 'passed') throw new Refusal('conflict', notChanged(outcome, address, who, site.hqUrl))

  const pointed: StoredSite = { ...site, hqUrl: address }
  ctx.state.writeJson(['site', 'settings.json'], pointed)
  ctx.state.writePrivate(['site', 'compose.json'], composeJson(siteComposeProject(ctx.state, ctx.names, pointed, installSecrets(ctx.state), paths, await installSubnets(ctx))))
  const now = installed(ctx).site!
  await ctx.docker.composeUp(now.project, now.file)
  return { siteName: site.name, address, previous: site.hqUrl }
}

const sameAddress = (a: string, b: string) => a.trim().replace(/\/+$/, '').toLowerCase() === b.trim().replace(/\/+$/, '').toLowerCase()

/**
 * The machine followed HQ from `from` to `to` (`link/addressFollow.ts`): the site here, which HQ told the same new
 * address and follows by itself, is recorded at it too, so nothing built on its recorded address goes stale. Its
 * compose file is written again but the site is not restarted: when it next starts, it starts at the new address,
 * which the machine's check proved is the same HQ. A site recorded at another address is left as it is.
 */
export async function followSiteAddress(ctx: Context, from: string, to: string): Promise<boolean> {
  const here = installed(ctx)
  const site = here.site?.settings
  if (here.hq || !site?.hqUrl || !sameAddress(site.hqUrl, from)) return false
  const paths = await ctx.machinePaths()
  const pointed: StoredSite = { ...site, hqUrl: to.trim().replace(/\/+$/, '') }
  ctx.state.writeJson(['site', 'settings.json'], pointed)
  if (paths) ctx.state.writePrivate(['site', 'compose.json'], composeJson(siteComposeProject(ctx.state, ctx.names, pointed, installSecrets(ctx.state), paths, await installSubnets(ctx))))
  return true
}
