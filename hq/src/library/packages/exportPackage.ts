/**
 * Exports one library item as its package (format 2). Skills and templates are assets: a template's package is its
 * pinned version's files, its carried skills inside, so it installs elsewhere with everything it needs (D10).
 */
import { prisma } from 'wasp/server'
import { AGENTHIX_PUBLISHER, ASSET_MANIFEST_FILE, ASSET_MANIFEST_FORMAT, parseAssetIdentity } from '@agenthix/core'
import { readContent } from '../../assets/content'
import { readParts } from '../../assets/install/parts'
import { skillDescription, skillMdOf, skillTitle } from '../../assets/skillFile'
import { shelfArrival } from '../../assets/sources/imageShelf'
import { findTemplate, templateFiles } from '../../assets/templates/templateAssets'
import { writePackageZip, type PackageFile } from './packageZip'
import type { PackageKind } from './packageManifest'

export class LibraryItemNotFoundError extends Error {}

export async function exportLibraryPackage(kind: PackageKind, id: string): Promise<{ buffer: Buffer; filename: string }> {
  const { root, manifest, files } = await packageParts(kind, id)
  return { buffer: await writePackageZip(root, manifest, files), filename: `${root}.zip` }
}

function packageParts(kind: PackageKind, id: string): Promise<{ root: string; manifest: object | null; files: PackageFile[] }> {
  return kind === 'skill' ? skillParts(id) : templateParts(kind, id)
}

/**
 * A template exports as its pinned version: the package as installed, its manifest and carried skills included, so
 * it is the same package wherever it is installed next. Exported unsigned, as a skill is.
 */
const TEMPLATE_KIND = { agent: ['AGENT', 'Agent'], board: ['BOARD', 'Board'], team: ['TEAM', 'Team'], 'task-template': ['TASK_TEMPLATE', 'Task template'] } as const

async function templateParts(kind: keyof typeof TEMPLATE_KIND, id: string): Promise<{ root: string; manifest: object | null; files: PackageFile[] }> {
  const [row, word] = TEMPLATE_KIND[kind]
  const template = await findTemplate(prisma, row, id)
  if (!template) throw new LibraryItemNotFoundError(`${word} not found in the library`)
  return { root: template.name, manifest: null, files: await templateFiles(prisma, template) }
}

/**
 * A skill exports as an asset package (format 2): its pinned version's files, under a manifest naming the publisher
 * it is installed under here. Exported unsigned: a package is signed by its publisher's release, never by hq.
 */
async function skillParts(id: string): Promise<{ root: string; manifest: object; files: PackageFile[] }> {
  const shelf = parseAssetIdentity(id)
  let found: { publisher: string; name: string; version: string; files: PackageFile[] } | null = null
  if (shelf?.publisher === AGENTHIX_PUBLISHER) {
    const arrival = await shelfArrival(shelf.name).catch(() => null)
    if (arrival) {
      const parts = readParts(arrival.arrived)
      found = { publisher: AGENTHIX_PUBLISHER, name: parts.name, version: parts.version, files: parts.files }
    }
  } else {
    const row = await prisma.asset.findUnique({ where: { id }, include: { currentVersion: true } })
    if (row && row.kind === 'SKILL' && !row.removedAt && row.currentVersion) {
      found = { publisher: row.publisher, name: row.name, version: row.currentVersion.version, files: await readContent(row.currentVersion.digest, prisma) }
    }
  }
  if (!found) throw new LibraryItemNotFoundError('Skill not found in the library')
  const md = skillMdOf(found.files)
  const manifest = {
    format: ASSET_MANIFEST_FORMAT, kind: 'skill', publisher: found.publisher, name: found.name, version: found.version,
    description: skillDescription(md) || skillTitle(md, found.name),
  }
  return { root: found.name, manifest, files: found.files.filter(f => f.path !== ASSET_MANIFEST_FILE) }
}
