/**
 * Imports a package into the library as the organisation's own item, recording
 * where it came from, its version and its publisher (`packageManifest.ts`).
 * Its files go to hq's own storage; nothing of it runs, and using it later
 * makes a copy, as with any library item.
 *
 * Importing an item made here or installed again replaces it; an item with the
 * name or id of a built-in one is refused, since built-in items are hq's own.
 * A team template holds agents only, with their boards: one naming people is
 * refused.
 */
import { prisma } from 'wasp/server'
import { isValidAgentHandle, INVALID_AGENT_HANDLE_MESSAGE } from '../../agents/agentHandle'
import { parseFrontmatter } from '../../agents/skillsActiveService'
import { createBoardTemplate, parseBoardTemplateColumns } from '../boardTemplateService'
import { replaceStorageTree } from './fileTree'
import { fileText, readPackageZip, type PackageFile } from './packageZip'
import { importedSource, type PackageKind, type PackageManifest } from './packageManifest'

export class PackageImportError extends Error {
  constructor(message: string, readonly status: 400 | 409 = 400) {
    super(message)
  }
}

export type ImportedItem = { kind: PackageKind; id: string; name: string }

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

function record(m: PackageManifest) {
  return { source: importedSource(m.source), packageVersion: m.version, publisher: m.publisher }
}

function json(files: PackageFile[], path: string): Record<string, unknown> {
  const raw = fileText(files, path)
  if (raw === null) throw new PackageImportError(`This package has no ${path}`)
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
  } catch { /* refused below */ }
  throw new PackageImportError(`${path} is not a JSON object`)
}

export async function importLibraryPackage(buffer: Buffer): Promise<ImportedItem> {
  const { root, manifest, files } = await readPackageZip(buffer)
  if (!manifest) throw new PackageImportError('This is not a library package: it has no package.json')
  switch (manifest.kind) {
    case 'agent': return importAgent(manifest, files)
    case 'board': return importBoard(manifest, files)
    case 'skill': return importSkill(manifest, root, files)
    case 'team': return importTeam(manifest, files)
  }
}

async function importAgent(m: PackageManifest, files: PackageFile[]): Promise<ImportedItem> {
  const agent = json(files, 'agent.json')
  if (typeof agent.name !== 'string' || !agent.name.trim()) throw new PackageImportError('agent.json needs a name')
  if (!isValidAgentHandle(agent.handle)) throw new PackageImportError(INVALID_AGENT_HANDLE_MESSAGE)
  const slug = agent.handle
  const existing = await prisma.agentTemplate.findUnique({ where: { slug } })
  if (existing?.isSystem) throw new PackageImportError(`A built-in agent is already called ${slug}`, 409)
  const assetPath = `org/agents/${slug}`
  await replaceStorageTree(assetPath, files)
  const data = { name: agent.name.trim(), handle: slug, assetPath, isSystem: false, ...record(m) }
  const row = await prisma.agentTemplate.upsert({ where: { slug }, create: { slug, ...data }, update: data })
  return { kind: 'agent', id: row.id, name: row.name }
}

async function importBoard(m: PackageManifest, files: PackageFile[]): Promise<ImportedItem> {
  const board = json(files, 'board.json')
  const columns = parseBoardTemplateColumns(board.columns)
  if (columns.length === 0) throw new PackageImportError('board.json needs its columns')
  const name = typeof board.name === 'string' && board.name.trim() ? board.name.trim() : m.name
  const description = typeof board.description === 'string' ? board.description : m.description
  // createBoardTemplate checks the columns (a TemplateValidationError is the caller's 400).
  const created = await createBoardTemplate({ name, description, columns })
  await prisma.boardTemplate.update({ where: { id: created.id }, data: record(m) })
  return { kind: 'board', id: created.id, name }
}

async function importSkill(m: PackageManifest, root: string, files: PackageFile[]): Promise<ImportedItem> {
  if (!SLUG_RE.test(root)) throw new PackageImportError("A skill package's folder is its name: lowercase letters, digits and hyphens")
  const body = fileText(files, 'SKILL.md')
  if (body === null) throw new PackageImportError('This package has no SKILL.md')
  const front = parseFrontmatter(body)
  const name = front.name !== 'Unnamed' ? front.name : m.name
  const description = front.description || m.description
  const org = await prisma.org.findFirst({ select: { id: true } })
  if (!org) throw new PackageImportError('Create the organisation before importing skills for it', 409)
  const assetPath = `org/skills/${root}`
  await replaceStorageTree(assetPath, files)
  const existing = await prisma.skill.findFirst({ where: { slug: root, scope: 'ORG', orgId: org.id } })
  const data = { name, description, assetPath, ...record(m) }
  const row = existing
    ? await prisma.skill.update({ where: { id: existing.id }, data })
    : await prisma.skill.create({ data: { slug: root, scope: 'ORG', orgId: org.id, ...data } })
  return { kind: 'skill', id: row.id, name: row.name }
}

async function importTeam(m: PackageManifest, files: PackageFile[]): Promise<ImportedItem> {
  const template = json(files, 'template.json')
  const id = template.id
  if (typeof id !== 'string' || !SLUG_RE.test(id)) throw new PackageImportError('template.json needs an id: lowercase letters, digits and hyphens')
  if ('people' in template) throw new PackageImportError('A team template holds agents only; people are added after')
  const teams = Array.isArray(template.teams) ? (template.teams as Array<Record<string, unknown>>) : null
  if (!teams || teams.length === 0) throw new PackageImportError('template.json needs at least one team of agents')
  for (const team of teams) {
    if ('people' in team) throw new PackageImportError('A team template holds agents only; people are added after')
    const handles = Array.isArray(team.agents) ? team.agents : []
    for (const handle of handles) {
      if (!isValidAgentHandle(handle)) throw new PackageImportError(INVALID_AGENT_HANDLE_MESSAGE)
      const agent = json(files, `agents/${handle}/agent.json`)
      for (const skill of Array.isArray(agent.skills) ? agent.skills : []) {
        if (typeof skill !== 'string' || fileText(files, `skills/${skill}/SKILL.md`) === null) {
          throw new PackageImportError(`Agent ${handle} names a skill the package does not hold`)
        }
      }
    }
  }
  await requireKnownBoards(template.projects)
  const existing = await prisma.workforceTemplate.findUnique({ where: { id } })
  if (existing?.isSystem) throw new PackageImportError(`A built-in team template already has the id ${id}`, 409)
  const assetPath = `org/teams/${id}`
  await replaceStorageTree(assetPath, files)
  const name = typeof template.name === 'string' && template.name.trim() ? template.name.trim() : m.name
  const description = typeof template.description === 'string' ? template.description : m.description
  const tags = Array.isArray(template.tags) ? template.tags.filter((t): t is string => typeof t === 'string') : []
  const data = { name, description, tags, assetPath, isSystem: false, ...record(m) }
  const row = await prisma.workforceTemplate.upsert({ where: { id }, create: { id, ...data }, update: data })
  return { kind: 'team', id: row.id, name: row.name }
}

/** The boards a team template's agents bring name board templates this hq has. */
async function requireKnownBoards(projects: unknown): Promise<void> {
  const list = Array.isArray(projects) ? (projects as Array<{ boards?: unknown }>) : []
  const ids = list.flatMap(p => (Array.isArray(p.boards) ? p.boards : []).map(b => (b as { templateId?: unknown }).templateId))
  if (ids.some(id => typeof id !== 'string')) throw new PackageImportError('Each board in template.json names its board template')
  const wanted = [...new Set(ids as string[])]
  if (wanted.length === 0) return
  const found = await prisma.boardTemplate.count({ where: { id: { in: wanted } } })
  if (found !== wanted.length) throw new PackageImportError('This team template uses a board this hq does not have; import that board first')
}
