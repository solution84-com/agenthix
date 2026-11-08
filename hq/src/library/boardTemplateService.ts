/**
 * Board templates as Library assets (adr-0157), deprecated: a board is a view and is not shared (adr-0176); task
 * templates carry a project's types and fields instead. Read only, for the team templates and the workforce assembly
 * that still name one, until they carry types and fields: `board` assets whose pinned version holds `board.json`.
 */
import { prisma } from 'wasp/server'
import { formatAssetIdentity } from '@agenthix/core'
import { readBoardTemplate, type BoardTemplateColumn } from '../assets/install/templateFiles'
import { findTemplate, listTemplates, templateFiles, type TemplateAsset } from '../assets/templates/templateAssets'
import type { Db } from '../packages/packageStore'

export type { BoardTemplateColumn }

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
