/**
 * Agenthix's agent, board and team templates, shipped in hq's image and installed by hq at boot as `agenthix/<name>`
 * (adr-0157; spec part 2). hq's image is signed and verified before it runs (adr-0117), so a package read from it is
 * Agenthix's by where it is. Each is built from its one source (`imageBuild.ts`), versioned, and goes through the one
 * pipeline. A template already here at its version is left alone, so boot never undoes what an administrator did; a
 * newer one in a new image is offered as an update, never applied by itself (V2).
 *
 * **Boot installs the template, never the skills it carries** (D14): those are installed when the template is first
 * used (`carried.ts`), so a new organisation's Library holds no shelf skill it didn't choose.
 *
 * **The build numbers the versions** rather than anyone by hand: content the template already held keeps that
 * version; new content takes the template's own `package.json` version the first time, then the next major version.
 *
 * Kernel's own template is not a Library template, and never offered: its instructions are written to the built-in
 * agent from the image (`packages/kernelPackage.ts`), and its skills installed and given to it (`kernelSkills.ts`).
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { AGENTHIX_PUBLISHER, ASSET_MANIFEST_FILE, compareSemVer, isAssetName, parseSemVer } from '@agenthix/core'
import type { PrismaClient } from '@prisma/client'
import { getHqAssetsRoot } from '../../server/hqAssets'
import { readFileTree } from '../../library/packages/fileTree'
import type { PackageFile } from '../../library/packages/packageZip'
import type { Db } from '../../packages/packageStore'
import { fingerprintOf } from '../content'
import { kindRow } from '../kinds'
import { writePlan } from '../install/commit'
import { readParts } from '../install/parts'
import { previewImageInstall } from '../install/preview'
import type { Arrival } from '../install/types'
import { createVerifier } from '../signing'
import { buildTemplate, readSkillSources, sourceVersion, stampVersion, type SkillSources } from './imageBuild'

const KERNEL = 'kernel'
const FOLDERS = { agent: 'agents', board: 'boards', team: 'teams' } as const
export type ImageTemplateKind = keyof typeof FOLDERS
export const IMAGE_TEMPLATE_KINDS = Object.keys(FOLDERS) as ImageTemplateKind[]

export function imageTemplatesDir(kind: ImageTemplateKind): string {
  return path.join(getHqAssetsRoot(), 'library', FOLDERS[kind])
}

/** Every template folder of this kind in the image, as written there, before the build; one with no manifest is skipped. */
export async function imageTemplateSources(kind: ImageTemplateKind): Promise<Array<{ root: string; files: PackageFile[] }>> {
  const dir = imageTemplatesDir(kind)
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  const out: Array<{ root: string; files: PackageFile[] }> = []
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (!entry.isDirectory() || entry.name === KERNEL || !isAssetName(entry.name)) continue
    const files = await readFileTree(path.join(dir, entry.name))
    if (files.some(f => f.path === ASSET_MANIFEST_FILE)) out.push({ root: entry.name, files })
  }
  return out
}

/** Every template package of this kind, built, as the pipeline receives it. Throws `ImageBuildError` for one that can't be built. */
export async function imageTemplateArrivals(kind: ImageTemplateKind, sources?: SkillSources): Promise<Arrival[]> {
  const from = sources ?? await readSkillSources()
  return (await imageTemplateSources(kind)).map(({ root, files }) => arrival(root, buildTemplate(root, files, from)))
}

function arrival(root: string, files: PackageFile[]): Arrival {
  return { source: 'image', arrived: { root, files }, bundle: null, sourceUrl: null }
}

function nextMajor(version: string): string {
  return `${(parseSemVer(version)?.major ?? 0) + 1}.0.0`
}

/** The version this build of a template is: one already held with this content, else its own first, else the next major. */
export async function imageTemplateVersion(db: Db, kind: ImageTemplateKind, root: string, built: PackageFile[]): Promise<string> {
  const held = await db.assetVersion.findMany({
    where: { asset: { kind: kindRow(kind), publisher: AGENTHIX_PUBLISHER, name: root } },
    select: { version: true, digest: true },
  })
  const same = held.find(v => fingerprintOf(stampVersion(built, v.version)) === v.digest)
  if (same) return same.version
  const own = sourceVersion(root, built)
  const highest = held.map(v => v.version).sort(compareSemVer).at(-1)
  return !highest || compareSemVer(own, highest) > 0 ? own : nextMajor(highest)
}

export type ImageInstallOutcome = { root: string; identity: string | null; outcome: string; problem: string | null }

/** Installs one image template, its carried skills left for first use (D14): refused or already here is reported, never thrown. */
async function installOne(db: PrismaClient, kind: ImageTemplateKind, root: string, built: PackageFile[], now: Date): Promise<ImageInstallOutcome> {
  let preview
  let stamped: PackageFile[]
  try {
    stamped = stampVersion(built, await imageTemplateVersion(db, kind, root, built))
    preview = await previewImageInstall(arrival(root, stamped), { db, verifier: createVerifier(), now })
  } catch (err) {
    return { root, identity: null, outcome: 'refused', problem: err instanceof Error ? err.message : String(err) }
  }
  const { main } = preview
  if (preview.refusal) return { root, identity: main.identity, outcome: 'refused', problem: preview.refusal }
  if (main.outcome === 'same' || main.outcome === 'older') return { root, identity: main.identity, outcome: main.outcome, problem: null }
  // An administrator removed it: it stays removed until one of them puts it back.
  if (main.outcome === 'restore') return { root, identity: main.identity, outcome: 'removed', problem: null }
  const parts = readParts({ root, files: stamped })
  await db.$transaction(tx => writePlan(tx, { main, embedded: [] }, parts, { source: 'BUILT_IN', signerKind: 'NONE', byId: null, note: null }, 'Installed from Agenthix'))
  return { root, identity: main.identity, outcome: main.outcome, problem: null }
}

export async function installImageTemplates(db: PrismaClient, now = new Date()): Promise<ImageInstallOutcome[]> {
  const sources = await readSkillSources()
  const out: ImageInstallOutcome[] = []
  for (const kind of IMAGE_TEMPLATE_KINDS) {
    for (const { root, files } of await imageTemplateSources(kind)) {
      let built: PackageFile[]
      try {
        built = buildTemplate(root, files, sources)
      } catch (err) {
        out.push({ root, identity: null, outcome: 'refused', problem: err instanceof Error ? err.message : String(err) })
        continue
      }
      out.push(await installOne(db, kind, root, built, now))
    }
  }
  return out
}
