/**
 * A development build's switch to another image built on the machine (spec Rule 1), so the whole switch, and putting
 * the old one back, can be run on a dev machine. It skips what only a published version has — the signature and the
 * "only forward" comparison — and is otherwise the published switch: the same journal and launcher, which checks the
 * new host service by its image instead (`launcher/built.ts`). A published host service never takes this path.
 */
import { Refusal } from '../owner/results'
import { cmd } from '../cli/words'
import { runArgs } from '../docker/containers'
import { DEVELOPMENT } from '../images/ownVersion'
import { isPublishedVersion } from '../images/published'
import { builtRefusal } from '../launcher/built'
import type { HostSwitch } from '../launcher/journal'
import { hostSpec, recordHostContainer, shellCommand } from '../launcher/record'
import { startSwitch } from '../launcher/start'
import type { Context } from '../service/context'
import { documentedRun, type HostServiceReady } from './hostService'
import { readUpgrades } from './settings'

const NOTHING = 'Nothing was changed.'

/** Checks that this development build can switch to `built`, and says how; nothing changes. */
export async function readyBuiltHostService(ctx: Context, built: string): Promise<HostServiceReady> {
  const current = ctx.machine.hostServiceVersion
  if (isPublishedVersion(current)) {
    throw new Refusal('conflict', `This host service is ${current}, a published version: it switches only forward, to a newer published version checked against its signature (${cmd('upgrades host')}), never to an image built on this machine. ${NOTHING}`)
  }
  const image = await ctx.containers.image(built)
  if (!image) throw new Refusal('failed', `The image ${built} is not on this machine. Build it here, then run this again. ${NOTHING}`)
  const self = await ctx.containers.inspect(ctx.names.hostContainer).catch(() => null)
  const problem = builtRefusal(built, image, self?.image ?? null)
  if (problem) throw new Refusal('conflict', `${problem} ${NOTHING}`)
  const record = await recordHostContainer(ctx.containers, ctx.state, ctx.now(), ctx.names.hostContainer).catch(() => null)
  // By its id, as the launcher starts it: exactly this content, and a development build too.
  const run = record && !('problem' in record)
    ? shellCommand(runArgs(hostSpec(record, image.id, ctx.names)))
    : await documentedRun(ctx, image.id)
  return {
    from: current, version: DEVELOPMENT, image: image.id, built,
    commands: [`docker rm -f ${ctx.names.hostContainer}`, run], launcher: readUpgrades(ctx.state).launcher,
  }
}

/** Starts the launcher for `built`; refused, changing nothing, on a published host service or with the launcher off. */
export async function switchBuiltHostService(ctx: Context, built: string): Promise<{ ready: HostServiceReady; ended: Promise<HostSwitch | null> }> {
  const ready = await readyBuiltHostService(ctx, built)
  if (!ready.launcher) {
    throw new Refusal('conflict', `The launcher is off on this machine, so the host service is switched by hand. To see how: ${cmd(`upgrades host --image ${built}`)}`)
  }
  const { ended } = await startSwitch(ctx, DEVELOPMENT, built, true)
  return { ready, ended }
}
