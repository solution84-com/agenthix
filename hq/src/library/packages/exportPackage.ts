/**
 * Exports one library item as its package (`packageManifest.ts`). A built-in
 * template's files come from hq's assets; one made here or installed, from hq's
 * own storage; a skill's, from its asset version.
 */
import { prisma } from 'wasp/server'
import { AGENTHIX_PUBLISHER, ASSET_MANIFEST_FILE, ASSET_MANIFEST_FORMAT, parseAssetIdentity } from '@agenthix/core'
import { readContent } from '../../assets/content'
import { readParts } from '../../assets/install/parts'
import { skillDescription, skillMdOf, skillTitle } from '../../assets/skillFile'
import { shelfArrival } from '../../assets/sources/imageShelf'
import { readBoardColumns } from '../boardTemplateService'
import { itemDir } from './itemDir'
import { readFileTree } from './fileTree'
import { writePackageZip, type PackageFile } from './packageZip'
import {
  PACKAGE_FORMAT, effectiveSource, manifestSource, publisherOf,
  type LibrarySource, type PackageKind, type PackageManifest,
} from './packageManifest'

export class LibraryItemNotFoundError extends Error {}

type Row = { source: LibrarySource; packageVersion: string; publisher: string | null; isSystem?: boolean; scope?: string }

function manifestOf(kind: PackageKind, name: string, description: string, row: Row): PackageManifest {
  return {
    format: PACKAGE_FORMAT,
    kind,
    name,
    description,
    source: manifestSource(effectiveSource(row)),
    version: row.packageVersion,
    publisher: publisherOf(row),
  }
}

export async function exportLibraryPackage(kind: PackageKind, id: string): Promise<{ buffer: Buffer; filename: string }> {
  const { root, manifest, files } = await packageParts(kind, id)
  return { buffer: await writePackageZip(root, manifest, files), filename: `${root}.zip` }
}

async function packageParts(kind: PackageKind, id: string): Promise<{ root: string; manifest: PackageManifest | object; files: PackageFile[] }> {
  switch (kind) {
    case 'agent': {
      const row = await prisma.agentTemplate.findUnique({ where: { id } })
      if (!row) throw new LibraryItemNotFoundError('Agent not found in the library')
      const files = await readFileTree(itemDir(row.assetPath, row.isSystem))
      return { root: row.slug, manifest: manifestOf('agent', row.name, '', row), files }
    }
    case 'board': {
      const row = await prisma.boardTemplate.findUnique({ where: { id } })
      if (!row) throw new LibraryItemNotFoundError('Board not found in the library')
      const columns = await readBoardColumns(row.assetPath, row.isSystem)
      const board = { name: row.name, description: row.description, columns }
      return {
        root: slugOf(row.name, 'board'),
        manifest: manifestOf('board', row.name, row.description, row),
        files: [{ path: 'board.json', content: Buffer.from(JSON.stringify(board, null, 2)) }],
      }
    }
    case 'skill': return skillParts(id)
    case 'team': {
      const row = await prisma.workforceTemplate.findUnique({ where: { id } })
      if (!row) throw new LibraryItemNotFoundError('Team not found in the library')
      const files = await readFileTree(itemDir(row.assetPath, row.isSystem))
      return { root: row.id, manifest: manifestOf('team', row.name, row.description, row), files }
    }
  }
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

function slugOf(name: string, fallback: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || fallback
}
