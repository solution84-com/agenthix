/**
 * The new machine's restore of hq, its default site and — when it ran beside them — the Fleet Console (spec §13): the
 * sealed backup that arrived, opened with this machine's own sealing key, checked, and written back as `agenthix
 * restore --from` would, but with nothing started beyond the databases. hq starts only when the old machine has
 * stopped its own and released it (hqReceive.ts), so the two never run it at once; the Fleet Console only once the old
 * machine has committed. hq answers at the address the Fleet Console's signed request named, or its own.
 *
 * What the machine had of its own before is kept aside (`move/secrets-before.json`), so a move that does not complete
 * leaves it as it was.
 */
import fs from 'node:fs'
import { composeJson, defaultSiteProject, hqProject } from '../compose/projects'
import { installed, type Context, type StoredHq } from '../service/context'
import { Refusal } from '../owner/results'
import { eachPart, PART, readManifest, sources } from '../backups/parts'
import { openBackup, WrongKey } from '../backups/seal'
import { compareVersions } from '../backups/restoreSource'
import { restoreImages, writeRestoredConsole } from '../backups/restore'
import type { HostKeys } from '@agenthix/core/host-crypto'
import { filesOfAddress, listenerFor } from '../install/address'
import { consoleHere } from '../install/console'
import { identityHolder } from './restoreSite'
import { installSubnets } from '../compose/subnets'
import { keepAgentSlice, pickAgentSlice } from '../compose/agentSlice'
import { readInstallation, recordPorts } from '../state/installation'
import { chooseConsolePort, chooseHqPort, type PortChoice } from '../install/ports'
import { checkPorts, restoredPortAsks } from '../install/portCheck'

const SECRETS_BEFORE = ['move', 'secrets-before.json']

export type RestoredHq = { previousAddress: string; address: string; consoleWithHq: boolean }

/** `ports`: what the move's request chose for this machine; else what this machine recorded, or the defaults. */
export async function restoreMovedHq(ctx: Context, file: string, keys: HostKeys, newAddress: string | null, ports: PortChoice = {}): Promise<RestoredHq> {
  let opened
  try {
    opened = await openBackup(fs.createReadStream(file) as AsyncIterable<Buffer>, identityHolder(keys))
  } catch (err) {
    throw new Refusal('failed', err instanceof WrongKey ? 'The backup that arrived is not sealed to this machine.' : `The backup that arrived cannot be read: ${err instanceof Error ? err.message : String(err)}.`)
  }
  const { header, records } = opened
  try {
    if (header.holds.length !== 2 || !header.holds.includes('hq') || !header.holds.includes('site')) throw new Refusal('conflict', 'The backup that arrived does not hold HQ and its site.')
    if (header.namespace !== ctx.names.namespace) throw new Refusal('conflict', `HQ comes from an install named "${header.namespace}", and this machine's is "${ctx.names.namespace}".`)
    if (compareVersions(header.version, ctx.machine.hostServiceVersion) > 0) {
      throw new Refusal('conflict', `HQ runs version ${header.version}, newer than this host service's ${ctx.machine.hostServiceVersion}. Upgrade the host service here first.`)
    }
    const here = installed(ctx)
    if (here.site || here.hq || consoleHere(ctx)) throw new Refusal('conflict', `${ctx.machine.name} already runs something of its own.`)
    if (ctx.figuresWarning) throw new Refusal('failed', ctx.figuresWarning)
    const paths = await ctx.machinePaths()
    if (!paths) throw new Refusal('failed', 'The host service cannot find its state folder on this machine.')

    const manifest = await readManifest(records)
    if (!manifest.hq) throw new Refusal('conflict', 'The backup that arrived does not hold HQ.')
    // Ports belong to this machine, not to HQ's data: chosen here, before anything is fetched.
    const recorded = readInstallation(ctx.state)?.ports ?? { hq: null, console: null }
    const chosen = {
      hq: chooseHqPort(newAddress ?? manifest.hq.address, ports.hqPort, recorded.hq),
      console: manifest.console ? chooseConsolePort(ports.consolePort, recorded.console) : recorded.console,
    }
    if (chosen.hq === chosen.console) {
      throw new Refusal('malformed', `HQ and the Fleet Console cannot both be published on port ${chosen.hq} on ${ctx.machine.name}. Choose another for one of them. Nothing was changed.`)
    }
    await checkPorts(ctx, restoredPortAsks(newAddress ?? manifest.hq.address, chosen, !!manifest.console))
    const agentSlice = await pickAgentSlice(ctx)
    const { hq: restored, site, console: fleetConsole } = await restoreImages(ctx, manifest)
    const address = newAddress ?? restored.address
    const hq: StoredHq = address === restored.address
      ? restored
      : { ...restored, address, ...listenerFor(address), ...filesOfAddress(address, restored) }

    const subnets = await installSubnets(ctx)
    keepAgentSlice(ctx.state, agentSlice)
    const installation = recordPorts(ctx.state, chosen)
    ctx.state.writeJson(SECRETS_BEFORE, { secrets: ctx.state.readJson('secrets.json') })
    ctx.state.writeJson(['secrets.json'], manifest.secrets)
    ctx.state.writeJson(['hq', 'settings.json'], hq)
    ctx.state.writeJson(['site', 'settings.json'], site)
    ctx.state.writePrivate(['hq', 'compose.json'], composeJson(hqProject(ctx.names, hq, manifest.secrets, ctx.machine.name, subnets, installation)))
    ctx.state.writePrivate(['site', 'compose.json'], composeJson(defaultSiteProject(ctx.names, site, manifest.secrets, paths, subnets, installation)))
    const now = installed(ctx)
    await ctx.backupIO.createProject(now.hq!.project, now.hq!.file)
    await ctx.backupIO.createProject(now.site!.project, now.site!.file)
    await ctx.backupIO.startServices(now.hq!.project, now.hq!.file, ['hq-db'])
    await ctx.backupIO.startServices(now.site!.project, now.site!.file, ['site-db'])
    if (fleetConsole) await ctx.backupIO.createProject(ctx.names.consoleProject, writeRestoredConsole(ctx, fleetConsole, manifest, await installSubnets(ctx)))
    ctx.state.folder('site', 'data')
    const src = sources(ctx.names, paths)
    await eachPart(records, async (name, bytes) => {
      if (name === PART.hqDatabase || name === PART.siteDatabase) await ctx.backupIO.restoreDatabase(src[name].container, src[name].database, bytes)
      else if (name === PART.hqStorage || name === PART.siteData || (name === PART.consoleState && fleetConsole)) await ctx.backupIO.writeFolder(src[name], bytes)
    })
    return { previousAddress: restored.address, address, consoleWithHq: fleetConsole !== null }
  } catch (err) {
    await records.return(undefined)
    if (err instanceof Refusal) throw err
    throw new Refusal('failed', `The restore stopped partway: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Takes away everything of hq here — containers, volumes, settings, secrets — and puts back what the machine had. */
export async function clearHq(ctx: Context): Promise<void> {
  const here = installed(ctx)
  const fleetConsole = consoleHere(ctx)
  if (fleetConsole) await ctx.docker.composeDownWithVolumes(fleetConsole.project, fleetConsole.file).catch(() => {})
  if (here.site) await ctx.docker.composeDownWithVolumes(here.site.project, here.site.file).catch(() => {})
  await ctx.docker.removeGroup(ctx.names.agentsProject).catch(() => {})
  if (here.hq) await ctx.docker.composeDownWithVolumes(here.hq.project, here.hq.file).catch(() => {})
  for (const part of ['hq', 'site', 'console']) fs.rmSync(ctx.state.path(part), { recursive: true, force: true })
  const before = ctx.state.readJson(...SECRETS_BEFORE) as { secrets?: unknown } | null
  if (before?.secrets) ctx.state.writeJson(['secrets.json'], before.secrets)
  else if (before) fs.rmSync(ctx.state.path('secrets.json'), { force: true })
  fs.rmSync(ctx.state.path(...SECRETS_BEFORE), { force: true })
}
