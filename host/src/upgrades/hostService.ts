/**
 * The host service's own image (spec §11, ADR-0118): checked like every other image and fetched by the digest its
 * signature covers, then switched to by the launcher in the host service's own image (`launcher/`), which puts the
 * old one back if the new one does not answer. A new minor version of HQ or a site moves the host service first,
 * since a host service runs HQ and sites of its own major and minor version.
 *
 * The launcher can be switched off on the machine (`agenthix upgrades host --launcher off`); the machine admin then
 * switches with the two commands the CLI prints — the same container, from the recorded settings, on the new image.
 */
import { STATE_MOUNT, type Context } from '../service/context'
import { Refusal } from '../owner/results'
import { cmd } from '../cli/words'
import { COMPOSE_PROJECT_LABEL, runArgs } from '../docker/containers'
import { checkImages, fetchImages } from '../images/images'
import { isPublishedVersion } from '../images/published'
import { readSwitch, type HostSwitch } from '../launcher/journal'
import { hostSpec, recordHostContainer, shellCommand } from '../launcher/record'
import { startSwitch } from '../launcher/start'
import { MISSED_AFTER_MS } from '../scheduled/scheduler'
import { readUpgrades } from './settings'
import { compare, lineOf, newest, publishedVersions } from './versions'

export type HostServiceReady = {
  from: string
  version: string
  /** The image fixed by its digest, `<repository>@sha256:…`. */
  image: string
  /** The commands that switch to it by hand, each as its words. */
  commands: string[]
  /** Whether the host service switches itself, through the launcher. */
  launcher: boolean
}

/** The launcher is on unless the machine admin turned it off; a development build is always switched by hand. */
export const launcherOn = (ctx: Context) => readUpgrades(ctx.state).launcher && isPublishedVersion(ctx.machine.hostServiceVersion)

const quoted = (p: string) => (/[\s"'$`\\]/.test(p) ? `'${p.replace(/'/g, `'\\''`)}'` : p)

/** The documented `docker run`, for when the host service cannot read back its own settings. */
async function documentedRun(ctx: Context, image: string): Promise<string> {
  const paths = await ctx.machinePaths()
  if (!paths) throw new Refusal('failed', 'The host service cannot find its state folder on this machine, so it cannot say how to switch.')
  return `docker run -d --name ${ctx.names.hostContainer} --restart unless-stopped ` +
    `-v /var/run/docker.sock:/var/run/docker.sock -v ${quoted(paths.state)}:${STATE_MOUNT} ` +
    `-v ${ctx.names.hostFiguresVolume}:/run/host-figures --network host --cap-add NET_ADMIN ` +
    `--label ${COMPOSE_PROJECT_LABEL}=${ctx.names.hostProject} ${image}`
}

/** Checks the host service's new image and fetches it; nothing else changes. */
export async function readyHostService(ctx: Context, version?: string): Promise<HostServiceReady> {
  const current = ctx.machine.hostServiceVersion
  let wanted = version
  if (!wanted) {
    const published = await publishedVersions(ctx, ['host'])
    if (!published.ok) throw new Refusal('failed', published.problem)
    wanted = newest(published.versions) ?? undefined
  }
  if (!wanted || (isPublishedVersion(current) && compare(wanted, current) <= 0)) {
    throw new Refusal('conflict', `The host service is on ${current}, the newest published version. Nothing to switch to.`)
  }
  const { pins } = await checkImages(ctx, [{ part: 'host', version: wanted }])
  const image = pins.host!
  await fetchImages(ctx, [image])
  const record = await recordHostContainer(ctx.containers, ctx.state, ctx.now(), ctx.names.hostContainer).catch(() => null)
  const run = record && !('problem' in record)
    ? shellCommand(runArgs(hostSpec(record, image, ctx.names)))
    : await documentedRun(ctx, image)
  return { from: current, version: wanted, image, commands: [`docker rm -f ${ctx.names.hostContainer}`, run], launcher: launcherOn(ctx) }
}

/** Checks and fetches the new image, then starts the launcher; refused, changing nothing, when it is off. */
export async function switchHostService(ctx: Context, version?: string): Promise<{ ready: HostServiceReady; ended: Promise<HostSwitch | null> }> {
  if (!launcherOn(ctx)) {
    throw new Refusal('conflict', isPublishedVersion(ctx.machine.hostServiceVersion)
      ? `The launcher is off on this machine, so the host service is switched by hand. To see how: ${cmd('upgrades host')}`
      : 'This host service is a development build, which is switched by building it again.')
  }
  const ready = await readyHostService(ctx, version)
  const { ended } = await startSwitch(ctx, ready.version, ready.image)
  return { ready, ended }
}

/**
 * Moves the host service to `version` before an upgrade of HQ or a site to it, when the upgrade runs. This process
 * is stopped when the switch succeeds, and the new host service runs the upgrade again, now its own version; it
 * returns only by throwing why the host service did not move. A switch to the same version that failed lately is
 * not tried again by itself, so a scheduled upgrade the old host service runs again does not loop.
 */
export async function moveHostServiceFirst(ctx: Context, version: string): Promise<never> {
  const needs = `It needs the host service ${lineOf(version)} first`
  if (!launcherOn(ctx)) throw new Refusal('conflict', `${needs}, and the launcher is off on this machine. To see how to switch it by hand: ${cmd('upgrades host')}`)
  const last = readSwitch(ctx.state)
  if (last && last.to === version && (last.phase === 'failed' || last.phase === 'refused') && last.endedAt
    && ctx.now().getTime() - Date.parse(last.endedAt) < MISSED_AFTER_MS) {
    throw new Error(`${needs}, and the host service did not move to ${version}: ${last.reason}`)
  }
  const { ended } = await switchHostService(ctx, version)
  const s = await ended
  if (s?.phase === 'done') return new Promise<never>(() => {})
  throw new Error(`${needs}, and the host service did not move to ${version}: ${s?.reason ?? 'the launcher did not say how it went.'}`)
}
