/**
 * The host service's side of a switch to a new version of itself (ADR-0118): with the new image checked and on
 * the machine, it records its own settings, writes the switch down, and starts the launcher from its own image.
 * Then it holds the machine — no backup, restore or upgrade starts — until the launcher stops it, or says why not.
 */
import { exclusive } from '../backups/take'
import type { ContainerSpec } from '../docker/containers'
import { Refusal } from '../owner/results'
import { STATE_MOUNT, type Context } from '../service/context'
import type { InstallNames } from '../state/namespace'
import { ANSWER_WITHIN_MS, ENDED, endSwitch, readSwitch, writeSwitch, type HostSwitch } from './journal'
import { DOCKER_SOCKET, hostLabels, recordHostContainer, type HostContainerRecord } from './record'

/** How long the host service waits for the launcher before it lets the machine go again. */
const GIVE_UP_AFTER_MS = ANSWER_WITHIN_MS + 10 * 60_000

/** The launcher's container: the host service's own image, the Docker socket and the state folder, no network. */
export function launcherSpec(record: HostContainerRecord, imageId: string, names: InstallNames): ContainerSpec {
  const keep = record.mounts.filter(m => m.destination === DOCKER_SOCKET || m.destination === STATE_MOUNT)
  return {
    name: names.launcherContainer,
    labels: hostLabels(names),
    image: record.image,
    mounts: keep,
    network: 'none',
    capAdd: [],
    env: record.env.filter(e => e.startsWith('TZ=')),
    // Started again with the machine until it has ended; it then clears this itself.
    restart: 'unless-stopped',
    command: ['node', '--enable-source-maps', '/app/dist/launcher.js', 'swap', imageId],
  }
}

/** Waits for the switch to end, or for the launcher to stop without ending it. */
async function outcome(ctx: Context): Promise<HostSwitch | null> {
  const until = ctx.now().getTime() + GIVE_UP_AFTER_MS
  let gone = 0
  while (ctx.now().getTime() < until) {
    await ctx.sleep(ctx.waits.pollMs)
    const s = readSwitch(ctx.state)
    if (!s || ENDED.has(s.phase)) return s
    const launcher = await ctx.containers.inspect(ctx.names.launcherContainer).catch(() => null)
    gone = launcher?.running ? 0 : gone + 1
    if (gone >= 3 && s.phase === 'ready') {
      return endSwitch(ctx.state, s, 'failed', 'The launcher stopped before it switched anything. The host service is as it was.', ctx.now())
    }
  }
  return readSwitch(ctx.state)
}

export type SwitchStarted = {
  /** Settles when the switch ends without replacing this host service; this process is stopped when it succeeds. */
  ended: Promise<HostSwitch | null>
}

/**
 * Starts the launcher for `image` (fixed by digest, its signature checked), version `to`. Refuses, changing
 * nothing, when the host service's settings cannot be read back or another switch is under way.
 */
export async function startSwitch(ctx: Context, to: string, ref: string): Promise<SwitchStarted> {
  let started!: () => void
  let notStarted!: (err: unknown) => void
  const ready = new Promise<void>((resolve, reject) => { started = resolve; notStarted = reject })
  const ended = exclusive('switch of the host service', async () => {
    const record = await recordHostContainer(ctx.containers, ctx.state, ctx.now(), ctx.names.hostContainer)
    if ('problem' in record) throw new Refusal('failed', `The host service cannot read back the settings it runs with: ${record.problem}. Nothing was changed.`)
    const image = await ctx.containers.image(ref)
    if (!image) throw new Refusal('failed', `The image ${ref} is not on this machine. Nothing was changed.`)
    if (image.version !== to) throw new Refusal('failed', `The image ${ref} says it is ${image.version ?? 'no version'}, not ${to}. Nothing was changed.`)
    const leftover = await ctx.containers.inspect(ctx.names.launcherContainer)
    if (leftover?.running) throw new Refusal('busy', 'A switch of the host service is under way. Wait for it to end, then try again.')
    if (leftover) await ctx.containers.remove(leftover.id)
    const s = writeSwitch(ctx.state, {
      from: ctx.machine.hostServiceVersion, to, ref, imageId: image.id, checked: true, oldContainer: record.containerId,
      answerWithinMs: ANSWER_WITHIN_MS, startedAt: ctx.now().toISOString(), phase: 'ready', attempts: 0,
      waitingSince: null, endedAt: null, reason: null,
    })
    try {
      await ctx.containers.run(launcherSpec(record, image.id, ctx.names))
    } catch (err) {
      const why = `The launcher could not be started (${err instanceof Error ? err.message : String(err)}). Nothing was changed.`
      endSwitch(ctx.state, s, 'failed', why, ctx.now())
      throw new Refusal('failed', why)
    }
    started()
    return outcome(ctx)
  })
  ended.catch(notStarted)
  await ready
  return { ended }
}

/** At start: removes a launcher that has ended, and says how the last switch went. */
export async function afterSwitch(ctx: Context): Promise<HostSwitch | null> {
  const launcher = await ctx.containers.inspect(ctx.names.launcherContainer).catch(() => null)
  if (launcher && !launcher.running) await ctx.containers.remove(launcher.id).catch(() => {})
  return readSwitch(ctx.state)
}
