/**
 * The library's packages as operations (every screen reviewed spec §3,
 * Library): every item listed with its source, version and publisher; Export
 * and Import for each kind. Everyone in the organisation reads the library;
 * exporting and importing are its admins', as an agent's export and import are.
 */
import { HttpError, prisma } from 'wasp/server'
import { requireRole } from '../../server/identity/requireRole'
import { TemplateValidationError } from '../boardTemplateService'
import { exportLibraryPackage, LibraryItemNotFoundError } from './exportPackage'
import { importLibraryPackage, PackageImportError, type ImportedItem } from './importPackage'
import { PackageZipError } from './packageZip'
import { PACKAGE_KINDS, effectiveSource, publisherOf, type LibrarySource, type PackageKind } from './packageManifest'

type Ctx = { user?: { id: string } | null }

export type LibraryItem = {
  kind: PackageKind
  id: string
  name: string
  description: string
  source: LibrarySource
  version: string
  publisher: string | null
}

export type Library = Record<'agents' | 'boards' | 'skills' | 'teams', LibraryItem[]>

const item = (
  kind: PackageKind,
  row: { id: string; name: string; source: LibrarySource; packageVersion: string; publisher: string | null; isSystem?: boolean; scope?: string },
  description: string,
): LibraryItem => ({
  kind, id: row.id, name: row.name, description,
  source: effectiveSource(row), version: row.packageVersion, publisher: publisherOf(row),
})

export const getLibrary = async (_args: unknown, context: Ctx): Promise<Library> => {
  if (!context.user) throw new HttpError(401)
  const [agents, boards, skills, teams] = await Promise.all([
    prisma.agentTemplate.findMany({ orderBy: { name: 'asc' } }),
    prisma.boardTemplate.findMany({ orderBy: { name: 'asc' } }),
    prisma.skill.findMany({ where: { scope: { in: ['PLATFORM', 'ORG'] } }, orderBy: { name: 'asc' } }),
    prisma.workforceTemplate.findMany({ orderBy: { name: 'asc' } }),
  ])
  return {
    agents: agents.map(a => item('agent', a, '')),
    boards: boards.map(b => item('board', b, b.description)),
    skills: skills.map(s => item('skill', s, s.description)),
    teams: teams.map(t => item('team', t, t.description)),
  }
}

export const exportLibraryItem = async (
  { kind, id }: { kind: PackageKind; id: string },
  context: Ctx,
): Promise<{ base64: string; filename: string }> => {
  await requireRole(context, 'ADMIN', 'Exporting from the library')
  if (!PACKAGE_KINDS.includes(kind)) throw new HttpError(400, `A library item is one of ${PACKAGE_KINDS.join(', ')}`)
  try {
    const { buffer, filename } = await exportLibraryPackage(kind, id)
    return { base64: buffer.toString('base64'), filename }
  } catch (err) {
    if (err instanceof LibraryItemNotFoundError) throw new HttpError(404, err.message)
    throw err
  }
}

/** The package's size is bounded by the archive checks (`packageZip.ts`), not by trusting the upload. */
export const importLibraryItem = async ({ base64 }: { base64: string }, context: Ctx): Promise<ImportedItem> => {
  await requireRole(context, 'ADMIN', 'Importing into the library')
  if (typeof base64 !== 'string' || base64 === '') throw new HttpError(400, 'Choose a package to import')
  try {
    return await importLibraryPackage(Buffer.from(base64, 'base64'))
  } catch (err) {
    if (err instanceof PackageImportError) throw new HttpError(err.status, err.message)
    if (err instanceof PackageZipError || err instanceof TemplateValidationError) throw new HttpError(400, err.message)
    throw err
  }
}
