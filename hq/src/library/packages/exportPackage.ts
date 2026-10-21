/**
 * Exports one library item as its package (`packageManifest.ts`). A built-in
 * item's files come from hq's assets; one made here or installed, from hq's
 * own storage.
 */
import { prisma } from 'wasp/server'
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

async function packageParts(kind: PackageKind, id: string): Promise<{ root: string; manifest: PackageManifest; files: PackageFile[] }> {
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
    case 'skill': {
      const row = await prisma.skill.findUnique({ where: { id } })
      if (!row) throw new LibraryItemNotFoundError('Skill not found in the library')
      const files = await readFileTree(itemDir(row.assetPath, row.scope === 'PLATFORM'))
      return { root: row.slug, manifest: manifestOf('skill', row.name, row.description, row), files }
    }
    case 'team': {
      const row = await prisma.workforceTemplate.findUnique({ where: { id } })
      if (!row) throw new LibraryItemNotFoundError('Team not found in the library')
      const files = await readFileTree(itemDir(row.assetPath, row.isSystem))
      return { root: row.id, manifest: manifestOf('team', row.name, row.description, row), files }
    }
  }
}

function slugOf(name: string, fallback: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || fallback
}
