/**
 * Board templates as Library assets (adr-0157): `board` assets whose pinned version holds `board.json`. Agenthix's
 * come from hq's image (`assets/templates/imageTemplates.ts`); the organisation's own are made here, under its
 * publisher name, as version 1.0.0 and then each next minor version, with history. A board made from one copies its
 * columns and keeps a read-only link to that version (adr-0072): it never follows the template.
 *
 * Today's screen has no drafts, so each save publishes the next version directly; another publisher's template is not
 * edited here (editing it makes the organisation's own copy, which the asset's page offers).
 */
import { prisma } from 'wasp/server'
import { formatAssetIdentity, parseSemVer } from '@agenthix/core'
import type { PackageFile } from './packages/packageZip'
import { storeContent } from '../assets/content'
import { organisationPublisher } from '../assets/organisationPublisher'
import { slugOf } from '../assets/publisherNames'
import { BOARD_FILE, readBoardTemplate, TemplateFileError, type BoardTemplateColumn } from '../assets/install/templateFiles'
import { findTemplate, listTemplates, templateFiles, type TemplateAsset } from '../assets/templates/templateAssets'
import type { Db } from '../packages/packageStore'

export type { BoardTemplateColumn }

const NOTHING = 'Nothing was changed.'
const FIRST_VERSION = '1.0.0'

export class TemplateValidationError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 | 409 = 400) {
    super(message)
    this.name = 'TemplateValidationError'
  }
}

export type BoardTemplateSummary = {
  id: string
  identity: string
  name: string
  description: string
  version: string
  publisher: string
  /** Agenthix's, from hq's image: read-only here. */
  isSystem: boolean
}

async function boardFile(db: Db, t: TemplateAsset) {
  return readBoardTemplate(await templateFiles(db, t))
}

function summary(t: TemplateAsset, file: { name: string; description: string }): BoardTemplateSummary {
  return {
    id: t.id, identity: formatAssetIdentity(t), name: file.name, description: file.description,
    version: t.currentVersion.version, publisher: t.publisher, isSystem: t.currentVersion.source === 'BUILT_IN',
  }
}

export async function listBoardTemplates(db: Db = prisma): Promise<BoardTemplateSummary[]> {
  const out: BoardTemplateSummary[] = []
  for (const t of await listTemplates(db, 'BOARD')) {
    try {
      out.push(summary(t, await boardFile(db, t)))
    } catch {
      continue
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export async function getBoardTemplate(ref: string, db: Db = prisma) {
  const t = await findTemplate(db, 'BOARD', ref)
  if (!t) return null
  const file = await boardFile(db, t)
  return { ...summary(t, file), columns: file.columns }
}

/**
 * What a board made from a template starts with: the template's columns at its pinned version, and that version's
 * id to keep. Null for a template that isn't in the Library, so the board starts with the default columns.
 */
export async function boardTemplateColumns(ref: string | undefined | null, db: Db = prisma): Promise<{ madeFromVersionId: string; columns: BoardTemplateColumn[] } | null> {
  if (!ref) return null
  const t = await findTemplate(db, 'BOARD', ref)
  if (!t) return null
  try {
    return { madeFromVersionId: t.currentVersion.id, columns: (await boardFile(db, t)).columns }
  } catch {
    return null
  }
}

function boardFiles(input: { name: string; description: string; columns: unknown[] }): PackageFile[] {
  const raw = { name: input.name, description: input.description, columns: input.columns.map((c, order) => ({ ...(c as object), order })) }
  const files = [{ path: BOARD_FILE, content: Buffer.from(JSON.stringify(raw, null, 2) + '\n', 'utf-8') }]
  try {
    readBoardTemplate(files)
  } catch (err) {
    if (err instanceof TemplateFileError) throw new TemplateValidationError(`${err.message} ${NOTHING}`)
    throw err
  }
  return files
}

export async function createBoardTemplate(
  params: { name: string; description?: string; columns: unknown[]; byId: string },
  db = prisma,
): Promise<BoardTemplateSummary> {
  const files = boardFiles({ name: params.name ?? '', description: params.description ?? '', columns: params.columns ?? [] })
  const publisher = await organisationPublisher(db)
  const name = slugOf(params.name).slice(0, 64).replace(/-+$/, '') || 'board'
  const taken = await db.asset.findUnique({ where: { kind_publisher_name: { kind: 'BOARD', publisher, name } }, select: { id: true } })
  if (taken) throw new TemplateValidationError(`The Library already has a board template called ${name}. Choose another name. ${NOTHING}`, 409)
  const id = await db.$transaction(async tx => {
    const asset = await tx.asset.create({ data: { kind: 'BOARD', publisher, name } })
    const version = await tx.assetVersion.create({
      data: { assetId: asset.id, version: FIRST_VERSION, digest: await storeContent(files, tx), source: 'MADE_HERE', byId: params.byId, note: 'Made here' },
    })
    await tx.asset.update({ where: { id: asset.id }, data: { currentVersionId: version.id } })
    await tx.assetPinChange.create({ data: { assetId: asset.id, toVersionId: version.id, byId: params.byId, reason: 'Published' } })
    return asset.id
  })
  return (await getBoardTemplate(id, db))!
}

async function ownTemplate(db: Db, id: string): Promise<TemplateAsset> {
  const t = await findTemplate(db, 'BOARD', id)
  if (!t) throw new TemplateValidationError(`That board template isn't in the Library. ${NOTHING}`, 404)
  if (t.publisher !== (await organisationPublisher(db))) {
    throw new TemplateValidationError(`${formatAssetIdentity(t)} is published by ${t.publisher}, so it can't be changed here. ${NOTHING}`, 409)
  }
  return t
}

function nextVersion(version: string): string {
  const v = parseSemVer(version)
  return v ? `${v.major}.${v.minor + 1}.0` : FIRST_VERSION
}

export async function updateBoardTemplate(
  params: { id: string; name?: string; description?: string; columns?: unknown[]; byId: string },
  db = prisma,
): Promise<BoardTemplateSummary> {
  const t = await ownTemplate(db, params.id)
  const current = await boardFile(db, t)
  const files = boardFiles({
    name: params.name ?? current.name, description: params.description ?? current.description, columns: params.columns ?? current.columns,
  })
  const from = t.currentVersion
  await db.$transaction(async tx => {
    const digest = await storeContent(files, tx)
    if (digest === from.digest) return
    const row = await tx.assetVersion.create({ data: { assetId: t.id, version: nextVersion(from.version), digest, source: 'MADE_HERE', byId: params.byId, note: 'Edited' } })
    const { count } = await tx.asset.updateMany({ where: { id: t.id, currentVersionId: from.id }, data: { currentVersionId: row.id } })
    if (count === 0) throw new TemplateValidationError(`Someone changed this board template at the same moment. Reload it and edit again. ${NOTHING}`, 409)
    await tx.assetPinChange.create({ data: { assetId: t.id, fromVersionId: from.id, toVersionId: row.id, byId: params.byId, reason: 'Published' } })
  })
  return (await getBoardTemplate(t.id, db))!
}

/** Removed from the Library, its history kept; boards made from it keep their columns and their link. */
export async function deleteBoardTemplate(id: string, byId: string, db = prisma): Promise<void> {
  const t = await findTemplate(db, 'BOARD', id)
  if (!t) return
  if (t.currentVersion.source === 'BUILT_IN') throw new TemplateValidationError(`Agenthix's board templates can't be removed. ${NOTHING}`, 409)
  await db.asset.update({ where: { id: t.id }, data: { removedAt: new Date(), removedById: byId } })
}
