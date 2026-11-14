/**
 * `agenthix install --files <host>` and `agenthix hq files-address <host>` (agenthix#273): uploaded files served from a
 * host a person names, rather than `files.<HQ's host>` — for a demo served through another installation's front door
 * (`front-door add-installation`), which never runs `front-door on --files`, and for files on a domain of their own.
 * Checked as `front-door on --files` checks its host. The choice is recorded in HQ's settings (`filesChosen`), so it is
 * kept through a demo reset, an upgrade, a new address, a move and a front door turned on without `--files`.
 */
import { previewDomainProblem } from '@agenthix/core'
import type { Progress } from '../sockets/lineServer'
import { installed, type Context, type StoredHq } from '../service/context'
import { Refusal } from '../owner/results'
import { composeJson, hqProject } from '../compose/projects'
import { installSecrets } from '../state/secrets'
import { installationOf } from '../state/installation'
import { installSubnets } from '../compose/subnets'
import { exclusive } from '../backups/take'
import { filesHostProblem } from '../frontDoor/config'
import { frontDoorOn, frontDoorSettings, oneFrontDoorChange, restore, snapshot, step } from '../frontDoor/frontDoor'
import { chosenFiles, isLocalAddress } from './address'

/** What `hq.filesAddress` answers: where files are served from now, and whether this installation's front door serves them. */
export type FilesAddressResult = {
  filesOrigin: string
  frontDoor: boolean
  /** Where hq-web listens on the machine, for a web server of the machine's own. */
  listen: { bind: string; port: number | null }
  /** This installation's namespace, which another installation's front door names it by. */
  namespace: string
}

/** Why files cannot be served from `host` beside HQ at `address`, as a sentence; null when they can. */
export function chosenFilesProblem(ctx: Context, address: string, host: string, previewDomain?: string | null): string | null {
  if (frontDoorSettings(ctx)?.given) {
    return 'Agenthix Cloud gives this machine its files host, with the certificate it gives the front door.'
  }
  if (isLocalAddress(address)) {
    return `HQ's address, ${address}, is this machine's own, so its files are served from files.localhost: a host of their own needs HQ at an address other computers open.`
  }
  const problem = filesHostProblem(host, address)
  if (problem) return `Files cannot be served from ${host}: ${problem}.`
  const previews = previewDomain ? previewDomainProblem(previewDomain, { hqHost: new URL(address).hostname, filesHost: host }) : null
  return previews ? `Files cannot be served from ${host} beside live apps at ${previewDomain}: ${previews}.` : null
}

export async function setFilesAddress(ctx: Context, raw: string, progress: (p: Progress) => void): Promise<FilesAddressResult> {
  const found = installed(ctx).hq
  if (!found) throw new Refusal('not_installed', `No HQ here: ${ctx.machine.name} runs no HQ. These commands run on HQ's own machine.`)
  const hq = found.settings
  const host = raw.trim().toLowerCase()
  const problem = chosenFilesProblem(ctx, hq.address, host, hq.previewDomain)
  if (problem) throw new Refusal('malformed', `${problem} Nothing was changed.`)
  if (hq.filesOrigin && new URL(hq.filesOrigin).hostname === host) {
    throw new Refusal('conflict', `Files are already served from ${hq.filesOrigin}. Nothing was changed.`)
  }
  const answer = (filesOrigin: string, frontDoor: boolean): FilesAddressResult => ({
    filesOrigin, frontDoor, listen: { bind: hq.bind, port: found.port }, namespace: ctx.names.namespace,
  })
  // The front door holds a certificate for the files host: it is written, started and checked again, as `front-door on --files` does.
  if (frontDoorSettings(ctx)?.on) {
    await frontDoorOn(ctx, host, progress)
    return answer(installed(ctx).hq!.settings.filesOrigin!, true)
  }
  const next: StoredHq = { ...hq, ...chosenFiles(hq.address, host) }
  await exclusive('change of the files address', () => oneFrontDoorChange(() => rewrite(ctx, next, host, progress)))
  return answer(next.filesOrigin!, false)
}

/** hq-server, the relay and hq-web carry `FILES_ORIGIN`: their project is written and started again, or put back. */
async function rewrite(ctx: Context, next: StoredHq, host: string, progress: (p: Progress) => void): Promise<void> {
  const found = installed(ctx).hq!
  const kept = snapshot(ctx)
  ctx.state.writeJson(['hq', 'settings.json'], next)
  ctx.state.writePrivate(['hq', 'compose.json'], composeJson(hqProject(ctx.names, next, installSecrets(ctx.state), ctx.machine.name, await installSubnets(ctx), installationOf(ctx.state))))
  try {
    await step(progress, `Giving files their address, ${host}`, async () => {
      await ctx.docker.composeUp(found.project, found.file)
      return { value: undefined, outcome: 'done' }
    })
  } catch (err) {
    restore(ctx, kept)
    await ctx.docker.composeUp(found.project, found.file).catch(() => {})
    const why = err instanceof Error ? err.message : String(err)
    throw new Refusal('failed', `HQ did not start again with its files at ${host} (${why.replace(/\.$/, '')}), so it was put back as it was.`)
  }
}
