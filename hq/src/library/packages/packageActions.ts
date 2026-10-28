/**
 * The library's packages as operations (every screen reviewed spec §3,
 * Library): every item listed with its source, version and publisher; Export
 * and Import for each kind. Everyone in the organisation reads the library;
 * exporting and importing are its admins', as an agent's export and import are.
 */
import { HttpError, prisma } from 'wasp/server'
import { AGENTHIX_PUBLISHER } from '@agenthix/core'
import { requireRole } from '../../server/identity/requireRole'
import { listBoardTemplates, TemplateValidationError, type BoardTemplateSummary } from '../boardTemplateService'
import { listAgentTemplates, type AgentTemplateSummary } from '../agentTemplateService'
import { listTeamTemplates, type TeamTemplateSummary } from '../workforceTemplateService'
import { exportLibraryPackage, LibraryItemNotFoundError } from './exportPackage'
import { importLibraryPackage, PackageImportError, type ImportedItem } from './importPackage'
import { PackageZipError } from './packageZip'
import { personActor } from '../../assets/policyActors'
import { asHttp } from '../../assets/operations'
import { PACKAGE_KINDS, BUILT_IN_PUBLISHER, type LibrarySource, type PackageKind } from './packageManifest'
import { listOrgSkills, listShelfSkills } from '../../agents/skillsLibraryService'

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

/**
 * Skills as assets: Agenthix's shelf (Built in), then what the organisation made (Made here) or installed from
 * anyone else, shown under their publisher.
 */
async function librarySkillItems(): Promise<LibraryItem[]> {
  const [shelf, org, organisation] = await Promise.all([
    listShelfSkills(), listOrgSkills(), prisma.org.findFirst({ select: { publisherName: true } }),
  ])
  // A template's role skill is shown with its template, never on its own (spec part 2 *Identity*).
  const rows = [...shelf, ...org.filter(r => !r.slug.includes('/'))].sort((a, b) => a.name.localeCompare(b.name))
  return rows.map(r => ({
    kind: 'skill' as const, id: r.id, name: r.name, description: r.description, version: r.version,
    source: r.scope === 'PLATFORM' ? 'BUILT_IN' as const : r.publisher === organisation?.publisherName ? 'MADE_HERE' as const : 'MARKETPLACE' as const,
    publisher: r.scope === 'PLATFORM' ? BUILT_IN_PUBLISHER : r.publisher,
  }))
}

/** A template as the Library lists it: Agenthix's (from hq's image), the organisation's own, or another publisher's. */
function templateItem(kind: 'agent' | 'board' | 'team', t: AgentTemplateSummary | BoardTemplateSummary | TeamTemplateSummary, organisation: string | null): LibraryItem {
  const source: LibrarySource = t.publisher === AGENTHIX_PUBLISHER ? 'BUILT_IN' : t.publisher === organisation ? 'MADE_HERE' : 'MARKETPLACE'
  return {
    kind, id: t.id, name: t.name, description: t.description, version: t.version, source,
    publisher: source === 'BUILT_IN' ? BUILT_IN_PUBLISHER : t.publisher,
  }
}

export const getLibrary = async (_args: unknown, context: Ctx): Promise<Library> => {
  if (!context.user) throw new HttpError(401)
  const [agents, boards, skills, teams, org] = await Promise.all([
    listAgentTemplates(),
    listBoardTemplates(),
    librarySkillItems(),
    listTeamTemplates(),
    prisma.org.findFirst({ select: { publisherName: true } }),
  ])
  const organisation = org?.publisherName ?? null
  return {
    agents: agents.map(a => templateItem('agent', a, organisation)),
    boards: boards.map(b => templateItem('board', b, organisation)),
    skills,
    teams: teams.map(t => templateItem('team', t, organisation)),
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
  const actor = await personActor(context.user!.id, prisma)
  try {
    return await asHttp(() => importLibraryPackage(Buffer.from(base64, 'base64'), actor))
  } catch (err) {
    if (err instanceof PackageImportError) throw new HttpError(err.status, err.message)
    if (err instanceof PackageZipError || err instanceof TemplateValidationError) throw new HttpError(400, err.message)
    throw err
  }
}
