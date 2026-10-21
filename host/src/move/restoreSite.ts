/**
 * The new machine's side of the restore (spec §13 *A site moves*, step 4): the sealed backup that arrived, opened with
 * this machine's own sealing key, checked, and its site's database and workspaces written back — with the master key
 * its stored secrets are sealed with, and named after this machine, as every site is — and nothing started but the
 * site's database. The site starts only when the old machine hands over its credential (receive.ts), so the two
 * never run it at once.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import type { HostKeys } from '@agenthix/core/host-crypto'
import { composeJson } from '../compose/projects'
import { checkImages, fetchImages } from '../images/images'
import { POSTGRES_IMAGE } from '../images/published'
import { installed, type Context, type StoredSite } from '../service/context'
import { Refusal } from '../owner/results'
import { installSecrets } from '../state/secrets'
import { siteComposeProject } from '../install/siteCompose'
import { eachPart, PART, readManifest, sources } from '../backups/parts'
import { openBackup, WrongKey, type Holder } from '../backups/seal'
import { compareVersions } from '../backups/restoreSource'
import { installSubnets } from '../compose/subnets'

/** This machine's identity sealing key as a backup holder: the old machine re-wrapped the backup to it. */
export function identityHolder(keys: HostKeys): Holder {
  const privateKey = crypto.createPrivateKey({ key: Buffer.from(keys.sealingPrivateKey, 'base64url'), format: 'der', type: 'pkcs8' })
  return { privateKey, publicKey: Buffer.from(keys.identity.sealingKey, 'base64url') }
}

export type Restored = { siteName: string; takenAt: string }

/** Restores the site in `file` here, stopped. Throws in words; what it wrote is the caller's to clear (`clearSite`). */
export async function restoreMovedSite(ctx: Context, file: string, keys: HostKeys, hqAddress: string): Promise<Restored> {
  let opened
  try {
    opened = await openBackup(fs.createReadStream(file) as AsyncIterable<Buffer>, identityHolder(keys))
  } catch (err) {
    throw new Refusal('failed', err instanceof WrongKey ? 'The backup that arrived is not sealed to this machine.' : `The backup that arrived cannot be read: ${err instanceof Error ? err.message : String(err)}.`)
  }
  const { header, records } = opened
  try {
    if (header.holds.length !== 1 || header.holds[0] !== 'site') throw new Refusal('conflict', 'The backup that arrived holds HQ; HQ moves with Move HQ….')
    if (header.namespace !== ctx.names.namespace) throw new Refusal('conflict', `The site comes from an install named "${header.namespace}", and this machine's is "${ctx.names.namespace}".`)
    if (compareVersions(header.version, ctx.machine.hostServiceVersion) > 0) {
      throw new Refusal('conflict', `The site runs version ${header.version}, newer than this host service's ${ctx.machine.hostServiceVersion}. Upgrade the host service here first.`)
    }
    if (installed(ctx).site || installed(ctx).hq) throw new Refusal('conflict', `${ctx.machine.name} already carries a site.`)
    if (ctx.figuresWarning) throw new Refusal('failed', ctx.figuresWarning)
    const paths = await ctx.machinePaths()
    if (!paths) throw new Refusal('failed', 'The host service cannot find its state folder on this machine.')

    const manifest = await readManifest(records)
    const { pins } = await checkImages(ctx, [{ part: 'site-server', version: manifest.site.version }, { part: 'agent', version: manifest.site.version }])
    await fetchImages(ctx, [POSTGRES_IMAGE, pins['site-server']!, pins.agent!])
    // The site's stored secrets are sealed with its master key: it comes with the site. The rest are this machine's.
    ctx.state.writeJson(['secrets.json'], { ...installSecrets(ctx.state), siteMasterKey: manifest.secrets.siteMasterKey })
    const site: StoredSite = {
      ...manifest.site,
      name: ctx.machine.name,
      images: { 'site-server': pins['site-server'], agent: pins.agent },
      hqUrl: hqAddress,
    }
    ctx.state.writeJson(['site', 'settings.json'], site)
    // Without its credential yet, the compose file starts the site unconnected; it is written again at release.
    ctx.state.writePrivate(['site', 'compose.json'], composeJson(siteComposeProject(ctx.state, ctx.names, site, installSecrets(ctx.state), paths, await installSubnets(ctx))))
    const here = installed(ctx).site!
    await ctx.backupIO.createProject(here.project, here.file)
    await ctx.backupIO.startServices(here.project, here.file, ['site-db'])
    ctx.state.folder('site', 'data')
    const src = sources(ctx.names, paths)
    await eachPart(records, async (name, bytes) => {
      if (name === PART.siteDatabase) await ctx.backupIO.restoreDatabase(src[name].container, src[name].database, bytes)
      else if (name === PART.siteData) await ctx.backupIO.writeFolder(src[name], bytes)
      // The Fleet Console, if one ran beside the site, stays where it was: only the site moves.
    })
    return { siteName: site.name, takenAt: header.takenAt }
  } catch (err) {
    await records.return(undefined)
    if (err instanceof Refusal) throw err
    throw new Refusal('failed', `The restore stopped partway: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Takes away everything of the site on this machine: its containers, its database's volume, its data and settings. */
export async function clearSite(ctx: Context): Promise<void> {
  const site = installed(ctx).site
  if (site) {
    await ctx.docker.composeDownWithVolumes(site.project, site.file).catch(() => {})
    await ctx.docker.removeGroup(ctx.names.agentsProject).catch(() => {})
  }
  fs.rmSync(ctx.state.path('site'), { recursive: true, force: true })
}
