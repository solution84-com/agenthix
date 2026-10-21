/**
 * Board Template Service
 * ======================
 * CRUD for BoardTemplate records. Columns live in JSON files on disk;
 * DB records store only metadata + assetPath.
 *
 * System templates: assetPath resolved via getHqAssetsRoot() (read-only)
 * Org templates:    assetPath resolved via getHqStorageRoot() (hq's own storage)
 *
 * assetPath already carries its own root-relative prefix (`org/boards/<id>.json`
 * for an org template, `library/boards/<id>.json` for a system one), so both
 * branches join it straight onto their root rather than re-deriving a filename
 * — the same idiom skillsLibraryService.ts uses for its own assetPath.
 * getBoardTemplatesDir() (hqStoragePaths.ts) holds the bare directory an org
 * template's assetPath resolves under.
 */
import { prisma } from 'wasp/server'
import path from 'node:path'
import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { getHqStorageRoot } from '../server/hqStoragePaths'
import { resolveHqAssetPath } from '../server/hqAssets'

export interface BoardTemplateColumn {
  name: string        // slug, e.g. "in_review"
  label: string       // display label, e.g. "In Review"
  status: 'TODO' | 'IN_PROGRESS' | 'DONE'
  color: string       // hex, e.g. "#a855f7"
  order: number
  description: string // agent-readable semantic description
  hint?: string       // transition hint: "move here when X"
  autoQueue?: boolean
}

export class TemplateValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TemplateValidationError'
  }
}

function validateColumns(columns: BoardTemplateColumn[]) {
  if (columns.some(c => c.name.toLowerCase() === 'backlog')) {
    throw new TemplateValidationError('Every board has a Backlog already; name the column something else')
  }
  const statuses = new Set(columns.map(s => s.status))
  const missing = (['TODO', 'IN_PROGRESS', 'DONE'] as const).filter(s => !statuses.has(s))
  if (missing.length > 0) {
    throw new TemplateValidationError(
      `Template must have at least one column for each status: missing ${missing.join(', ')}`
    )
  }
}

export function parseBoardTemplateColumns(raw: unknown): BoardTemplateColumn[] {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(parsed)) return []
    return parsed as BoardTemplateColumn[]
  } catch {
    return []
  }
}

/**
 * Read columns from a board template's assetPath.
 * Returns [] if the file cannot be read.
 */
export async function readBoardColumns(
  assetPath: string,
  isSystem: boolean,
): Promise<BoardTemplateColumn[]> {
  const filePath = isSystem ? resolveHqAssetPath(assetPath) : path.join(getHqStorageRoot(), assetPath)
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    const data = JSON.parse(raw)
    return Array.isArray(data.columns) ? data.columns : []
  } catch {
    return []
  }
}

export async function listBoardTemplates() {
  return prisma.boardTemplate.findMany({ orderBy: { createdAt: 'asc' } })
}

export async function getBoardTemplate(id: string) {
  const tpl = await prisma.boardTemplate.findUnique({ where: { id } })
  if (!tpl) return null
  const columns = await readBoardColumns(tpl.assetPath, tpl.isSystem)
  return { ...tpl, columns }
}

export async function createBoardTemplate(params: {
  name: string
  description?: string
  columns: BoardTemplateColumn[]
}) {
  validateColumns(params.columns)
  const numbered = params.columns.map((s, i) => ({ ...s, order: i }))
  const id = randomUUID()
  const assetPath = `org/boards/${id}.json`
  const filePath = path.join(getHqStorageRoot(), assetPath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify({ id, name: params.name, description: params.description ?? '', columns: numbered }, null, 2), 'utf-8')
  return prisma.boardTemplate.create({
    data: { id, name: params.name, description: params.description ?? '', assetPath, isSystem: false },
  })
}

export async function updateBoardTemplate(params: {
  id: string
  name?: string
  description?: string
  columns?: BoardTemplateColumn[]
}) {
  const { id, columns, ...rest } = params
  const existing = await prisma.boardTemplate.findUnique({ where: { id } })
  if (!existing) throw new TemplateValidationError('Template not found.')
  if (existing.isSystem) throw new TemplateValidationError('System templates cannot be modified.')
  if (columns !== undefined) validateColumns(columns)
  const numbered = columns?.map((s, i) => ({ ...s, order: i }))

  // Keep the on-disk JSON in sync with the DB for any field that lives in both
  // (F-031). A name/description-only edit still has to be written to disk —
  // previously the file was only updated when columns changed, causing DB/file
  // drift.
  if (numbered !== undefined || rest.name !== undefined || rest.description !== undefined) {
    const filePath = path.join(getHqStorageRoot(), existing.assetPath)
    const current = await fs.readFile(filePath, 'utf-8').then(JSON.parse).catch(() => ({}))
    const next = { ...current }
    if (rest.name !== undefined) next.name = rest.name
    if (rest.description !== undefined) next.description = rest.description
    if (numbered !== undefined) next.columns = numbered
    await fs.writeFile(filePath, JSON.stringify(next, null, 2), 'utf-8')
  }

  return prisma.boardTemplate.update({ where: { id }, data: rest })
}

export async function deleteBoardTemplate(id: string) {
  const existing = await prisma.boardTemplate.findUnique({ where: { id } })
  if (!existing) return
  if (existing.isSystem) throw new TemplateValidationError('System templates cannot be deleted.')
  const filePath = path.join(getHqStorageRoot(), existing.assetPath)
  await fs.rm(filePath, { force: true })
  return prisma.boardTemplate.delete({ where: { id } })
}
