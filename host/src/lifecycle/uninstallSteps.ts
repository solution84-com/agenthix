/**
 * `agenthix uninstall`, carried out (`uninstall.ts` says what it refuses and lists): each step removes one kind of
 * thing the install made, by its namespace name; a step that fails is reported and the rest still run, so it ends by
 * saying what was not removed. Finding a thing already gone is not a failure, so a second run, or one after a partial
 * run, removes what is left. The host service's own container goes last, through a helper started from its own image
 * (`launcher/uninstall.ts`), after this answer has reached the CLI.
 */
import fs from 'node:fs'
import type { Context } from '../service/context'
import type { Progress } from '../sockets/lineServer'
import { Refusal } from '../owner/results'
import { exclusive } from '../backups/take'
import { BackupStore } from '../backups/store'
import { consoleHere, takeConsoleAway } from '../install/console'
import { disconnectConsole } from '../link/manage'
import type { Post } from '../link/leaving'
import { forgetPin, readPin } from '../link/pin'
import { removeProtections } from '../protections/protections'
import { recordHostContainer } from '../launcher/record'
import { helperName, helperSpec, stateOnMachine } from '../launcher/uninstall'
import type { Removal } from '../docker/removal'
import {
  binnedEntries, fetchedImages, installNetworks, installProjects, installVolumes, otherHostContainers, uninstallRefusal,
} from './uninstall'

export type UninstallRequest = { confirmed: boolean; purge: string[] }

export type Uninstalled = {
  /** What could not be removed, each in a sentence. */
  notRemoved: string[]
  /** Images left because another container uses them. */
  imagesKept: number
  /** The helper that removes the host service's container, the figures volume and the state folder; null when it could not start. */
  helper: string | null
  stateFolder: string | null
  backupLocation: string | null
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err)).replace(/\.$/, '')

/** The erased HQ's address, or the erased site's name, typed for each entry still in the bin; refused otherwise. */
function purgeConfirmed(ctx: Context, typed: string[]): void {
  for (const entry of binnedEntries(ctx)) {
    if (typed.includes(entry.name)) continue
    const what = entry.target === 'hq' ? `HQ at ${entry.name}` : `the site ${entry.name}`
    throw new Refusal('conflict', `Not uninstalled: ${what} was erased and is kept until ${entry.purgeAfter.slice(0, 10)}. Nothing was removed. To purge it now, type its ${entry.target === 'hq' ? 'address' : 'name'} when asked.`)
  }
}

async function removeEach(names: string[], remove: (name: string) => Promise<Removal>): Promise<{ removed: number; inUse: string[] }> {
  let removed = 0
  const inUse: string[] = []
  for (const name of names) {
    const r = await remove(name)
    if (r === 'removed') removed++
    if (r === 'inUse') inUse.push(name)
  }
  return { removed, inUse }
}

const outcomeOf = (removed: number) => (removed ? `done (${removed})` : 'nothing left')

export function uninstallRun(ctx: Context, request: UninstallRequest, progress: (p: Progress) => void, post?: Post): Promise<Uninstalled> {
  return exclusive('uninstall', async () => {
    if (!request.confirmed) throw new Refusal('conflict', 'Not uninstalled: it was not confirmed. Nothing was removed.')
    await uninstallRefusal(ctx)
    purgeConfirmed(ctx, request.purge)
    if ((await ctx.containers.inspect(helperName(ctx.names)))?.running) {
      throw new Refusal('busy', 'An uninstall is finishing on this machine. Wait a minute, then run it again if anything is left.')
    }
    const notRemoved: string[] = []
    const removal = ctx.docker.removal()
    const backupLocation = new BackupStore(ctx.state).location()?.path ?? null
    const step = async (name: string, work: () => Promise<string>) => {
      progress({ event: 'step', step: name })
      try {
        progress({ event: 'stepDone', outcome: await work() })
      } catch (err) {
        notRemoved.push(message(err))
        progress({ event: 'stepDone', outcome: 'failed' })
      }
    }

    const pin = readPin(ctx.state)
    if (pin && !pin.local) {
      await step('Leaving the Fleet Console', async () => {
        const left = await disconnectConsole(ctx, post)
        if (left.hq === 'notYet') notRemoved.push('HQ did not answer, so it still lists this machine: a fleet admin removes it in the Fleet Console')
        return 'done'
      })
    } else if (pin) forgetPin(ctx.state)

    if (binnedEntries(ctx).length) {
      await step('Purging the erased backups', async () => {
        fs.rmSync(ctx.state.path('bin'), { recursive: true, force: true })
        return 'done'
      })
    }
    await step('Removing the Fleet Console', async () => {
      if (!consoleHere(ctx)) return 'nothing left'
      await takeConsoleAway(ctx)
      return 'done'
    })
    await step('Removing the containers left in its groups', async () => {
      let removed = 0
      for (const project of installProjects(ctx)) {
        const names = await removal.group(project)
        removed += (await removeEach(names, n => removal.container(n))).removed
      }
      return outcomeOf(removed)
    })
    await step('Removing the agent protections', async () => {
      return (await removeProtections(ctx.names.namespace)) === 'removed' ? 'done' : 'nothing left'
    })
    // The figures volume is the host service's own, in use until its container goes: the helper removes it.
    await step('Removing the volumes', async () => {
      const there = await removal.volumes()
      const wanted = installVolumes(ctx).filter(v => v !== ctx.names.hostFiguresVolume && there.includes(v))
      const r = await removeEach(wanted, v => removal.volume(v))
      if (r.inUse.length) throw new Error(`The volume ${r.inUse.join(', ')} is still used by a container, so it was left`)
      return outcomeOf(r.removed)
    })
    await step('Removing the networks', async () => {
      const there = await removal.networks()
      const wanted = [...installNetworks(ctx).filter(n => there.includes(n)), ...(await removal.groupNetworks(ctx.names.agentsProject))]
      const r = await removeEach([...new Set(wanted)], n => removal.network(n))
      if (r.inUse.length) throw new Error(`The network ${r.inUse.join(', ')} is still used by a container, so it was left`)
      return outcomeOf(r.removed)
    })
    let imagesKept = 0
    await step('Removing the images it fetched', async () => {
      const r = await removeEach(fetchedImages(await removal.images(), ctx.machine.hostServiceVersion), ref => removal.image(ref))
      imagesKept = r.inUse.length
      return r.inUse.length ? `${outcomeOf(r.removed)}; ${r.inUse.length} kept, in use` : outcomeOf(r.removed)
    })
    await step("Removing the host service's earlier containers", async () => {
      let removed = 0
      for (const name of otherHostContainers(ctx)) {
        const c = await ctx.containers.inspect(name)
        if (!c) continue
        await ctx.containers.remove(c.id)
        removed++
      }
      return outcomeOf(removed)
    })

    let helper: string | null = null
    await step('Handing the rest to its helper', async () => {
      const record = await recordHostContainer(ctx.containers, ctx.state, ctx.now(), ctx.names.hostContainer)
      if ('problem' in record) {
        throw new Error(`The host service's own container ${ctx.names.hostContainer}, its volume ${ctx.names.hostFiguresVolume} and the state folder were left: it cannot read back its own settings (${record.problem})`)
      }
      if (!stateOnMachine(record)) notRemoved.push('The state folder is not a folder on the machine, so it was left')
      await ctx.containers.run(helperSpec(record, ctx.names))
      helper = helperName(ctx.names)
      return 'done'
    })
    return {
      notRemoved, imagesKept, helper,
      stateFolder: (await ctx.machinePaths())?.state ?? null,
      backupLocation,
    }
  })
}
