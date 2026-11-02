/**
 * `previews.set` (live preview spec section 5): the fleet admin sets HQ's preview address on the relay's page.
 * hq-server builds every app's address from it, hq's relay answers it, hq-web passes its names to the relay, and the
 * host service's front door, when it runs, gets each app a certificate on first open. Asked again with the same domain
 * it changes nothing and runs the three checks again. A change that fails puts every file and container back.
 */
import { normalisePreviewDomain, previewDomainProblem, type PreviewsFigures } from '@agenthix/core'
import type { Progress } from '../sockets/lineServer'
import { installed, type Context, type StoredHq } from '../service/context'
import { Refusal } from '../owner/results'
import { composeJson, hqProject } from '../compose/projects'
import { installSubnets } from '../compose/subnets'
import { installSecrets } from '../state/secrets'
import { installationOf } from '../state/installation'
import { caddyfile, frontDoorCompose, frontDoorProject, hostOf } from '../frontDoor/config'
import { frontDoorSettings, oneFrontDoorChange, restore, snapshot, step } from '../frontDoor/frontDoor'
import { checkPreviews, previewsFigures } from './previewChecks'

export function previewsSet(ctx: Context, requested: string | null, progress: (p: Progress) => void): Promise<{ previews: PreviewsFigures }> {
  return oneFrontDoorChange(() => setPreviews(ctx, requested === null ? null : normalisePreviewDomain(requested), progress))
}

async function setPreviews(ctx: Context, domain: string | null, progress: (p: Progress) => void): Promise<{ previews: PreviewsFigures }> {
  const found = installed(ctx).hq
  if (!found) throw new Refusal('not_installed', `No HQ here: live apps are answered by HQ's relay, and ${ctx.machine.name} runs none. Nothing changed.`)
  const hq = found.settings
  const door = frontDoorSettings(ctx)
  const hqHost = hostOf(hq.address)
  if (domain !== null) {
    if (door?.on && door.given) {
      throw new Refusal('conflict', "This machine's front door serves the certificate it was given and asks for no other, so it cannot get one for each live app. Nothing changed.")
    }
    if (!/^https:\/\/[a-z]/i.test(hq.address) || /^https:\/\/(\d{1,3}(\.\d{1,3}){3}|\[)/i.test(hq.address)) {
      throw new Refusal('conflict', `Live apps need a domain: HQ is reached at ${hq.address}, and an app's address needs HTTPS and a name. Give HQ an https address with a name first. Nothing changed.`)
    }
    const filesHost = hq.filesOrigin ? hostOf(hq.filesOrigin) : null
    const problem = previewDomainProblem(domain, { hqHost, filesHost })
    if (problem) throw new Refusal('malformed', `The preview address cannot be ${domain}: ${problem}. Nothing changed.`)
  }

  if ((hq.previewDomain ?? null) !== domain) await apply(ctx, found, domain, progress)
  if (domain === null) return { previews: { domain: null, checkedAt: null, checks: [] } }
  await checkPreviews(ctx, domain, hqHost, progress)
  return { previews: previewsFigures(ctx)! }
}

type FoundHq = NonNullable<ReturnType<typeof installed>['hq']>

async function apply(ctx: Context, found: FoundHq, domain: string | null, progress: (p: Progress) => void): Promise<void> {
  const door = frontDoorSettings(ctx)
  const doorOn = door?.on === true
  const config = doorOn && !door.given ? caddyfile(ctx.names, door.hosts, false, domain) : null
  if (config) {
    await step(progress, 'Checking the configuration', async () => {
      const r = await ctx.docker.exec(ctx.names.container('hq-web'), ['caddy', 'validate', '--config', '/dev/stdin', '--adapter', 'caddyfile'], config)
      if (r.code !== 0) {
        const why = (r.stderr || r.stdout).trim().split('\n').pop() ?? ''
        throw new Refusal('failed', `The front door's configuration does not pass Caddy's check${why ? ` (${why})` : ''}. Nothing changed.`)
      }
      return { value: undefined, outcome: 'passes' }
    })
  }
  const paths = config ? await ctx.machinePaths() : null
  if (config && !paths) throw new Refusal('failed', 'The host service cannot find its state folder on this machine. Nothing changed.')

  const kept = snapshot(ctx)
  const next: StoredHq = { ...found.settings, previewDomain: domain }
  ctx.state.writeJson(['hq', 'settings.json'], next)
  ctx.state.writePrivate(['hq', 'compose.json'], composeJson(hqProject(ctx.names, next, installSecrets(ctx.state), ctx.machine.name, await installSubnets(ctx), installationOf(ctx.state))))
  const project = frontDoorProject(ctx.names)
  const file = ctx.state.path('front-door', 'compose.json')
  if (config && paths) {
    ctx.state.writePrivate(['front-door', 'Caddyfile'], config)
    ctx.state.writePrivate(['front-door', 'compose.json'], composeJson(frontDoorCompose(ctx.names, paths, config, installationOf(ctx.state))))
  }
  try {
    await step(progress, domain ? `Giving live apps their address, ${domain}` : 'Turning live apps off', async () => {
      await ctx.docker.composeUp(found.project, found.file)
      return { value: undefined, outcome: 'done' }
    })
    if (config) {
      await step(progress, 'Starting the front door again with it', async () => {
        await ctx.docker.composeUp(project, file)
        return { value: undefined, outcome: 'started' }
      })
    }
  } catch {
    restore(ctx, kept)
    await ctx.docker.composeUp(found.project, found.file).catch(() => {})
    if (config) await ctx.docker.composeUp(project, file).catch(() => {})
    throw new Refusal('failed', 'Rolled back: HQ and its front door are as they were, and live apps keep the address they had.')
  }
}
