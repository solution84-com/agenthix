/**
 * The site a Fleet Console starts on a machine it just connected (host-management spec §6, step 5), asked for as a
 * signed `install` of the site. The host service makes the site's credential itself and answers only its hash, which
 * the Fleet Console registers with HQ: the credential never leaves the machine. Asked again — after the machine was
 * disconnected and connected anew — it starts the same site, its data kept, with a new credential, since HQ forgot
 * the old one when the site was removed. The site is named after this machine: one machine carries one site.
 */
import type { Progress } from '../sockets/lineServer'
import { composeJson } from '../compose/projects'
import { checkImages, fetchImages } from '../images/images'
import { POSTGRES_IMAGE } from '../images/published'
import { installSecrets } from '../state/secrets'
import { installed, type Context, type StoredSite } from '../service/context'
import { Refusal } from '../owner/results'
import { product } from '../cli/words'
import type { ConsolePin } from '../link/pin'
import { makeSiteCredential, siteComposeProject } from './siteCompose'
import { installSubnets } from '../compose/subnets'
import { keepAgentSlice, pickAgentSlice } from '../compose/agentSlice'

let busy = false

export async function installManagedSite(
  ctx: Context, request: { version: string }, pin: ConsolePin, progress: (p: Progress) => void,
): Promise<{ state: 'started'; credentialHash: string }> {
  if (busy) throw new Refusal('busy', 'The site is already being started on this machine.')
  busy = true
  try {
    return await run(ctx, request, pin, progress)
  } finally {
    busy = false
  }
}

async function run(ctx: Context, request: { version: string }, pin: ConsolePin, progress: (p: Progress) => void) {
  const here = installed(ctx)
  if (here.hq || pin.local) {
    throw new Refusal('conflict', `${ctx.machine.name} runs HQ, whose own site is connected by configuration; it takes no other.`)
  }
  if (request.version !== ctx.machine.hostServiceVersion) {
    throw new Refusal('conflict', `This host service installs version ${ctx.machine.hostServiceVersion}, not ${request.version}.`)
  }
  if (ctx.figuresWarning) throw new Refusal('failed', ctx.figuresWarning)
  const paths = await ctx.machinePaths()
  if (!paths) throw new Refusal('failed', 'The host service cannot find its state folder on this machine.')
  const agentSlice = await pickAgentSlice(ctx)

  const kept = here.site?.settings
  const version = kept?.version ?? request.version
  progress({ event: 'step', step: `Checking the images are signed by ${product}` })
  const { pins } = await checkImages(ctx, [{ part: 'site-server', version }, { part: 'agent', version }])
  await fetchImages(ctx, [POSTGRES_IMAGE, pins['site-server']!, pins.agent!])
  progress({ event: 'stepDone', outcome: 'passes' })

  const site: StoredSite = {
    name: ctx.machine.name,
    version,
    images: { 'site-server': pins['site-server'], agent: pins.agent },
    hqUrl: pin.hqAddress,
    installedAt: kept?.installedAt ?? ctx.now().toISOString(),
  }
  keepAgentSlice(ctx.state, agentSlice)
  const { hash } = makeSiteCredential(ctx.state, ctx.now())
  const secrets = installSecrets(ctx.state)
  ctx.state.writeJson(['site', 'settings.json'], site)
  ctx.state.writePrivate(['site', 'compose.json'], composeJson(siteComposeProject(ctx.state, ctx.names, site, secrets, paths, await installSubnets(ctx))))
  const now = installed(ctx).site!
  await ctx.docker.composeUp(now.project, now.file)
  return { state: 'started' as const, credentialHash: hash }
}
