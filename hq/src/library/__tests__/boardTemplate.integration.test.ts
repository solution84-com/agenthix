/**
 * Board templates as Library assets against the real test database (ADR-0094): the organisation's own made here under
 * its publisher name, each save the next version with history, Agenthix's read-only, removal keeping the history, and
 * a board made from one keeping a read-only link to the version it was made from (adr-0072, adr-0157).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUser } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))

import {
  boardTemplateColumns, createBoardTemplate, deleteBoardTemplate, getBoardTemplate, listBoardTemplates, updateBoardTemplate,
  TemplateValidationError,
} from '../boardTemplateService'
import { createBoard } from '../../projects/boardService'
import { COLUMNS, boardPackage, seedTemplate } from '../../assets/templates/__tests__/templateFixtures'

let byId: string
beforeEach(async () => {
  await prisma.org.create({ data: { name: 'Fernhill' } })
  byId = (await createUser()).id
})

describe('createBoardTemplate @SC-029', () => {
  it('makes the organisation its own template, version 1.0.0, listed in the Library', async () => {
    const tpl = await createBoardTemplate({ name: 'Release Train', columns: COLUMNS, byId })
    expect(tpl).toMatchObject({ identity: 'fernhill/release-train', version: '1.0.0', isSystem: false, name: 'Release Train' })
    expect((await listBoardTemplates()).map(t => t.id)).toContain(tpl.id)
    const history = await prisma.assetPinChange.findMany({ where: { assetId: tpl.id } })
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ byId, reason: 'Published' })
  })

  it('refuses a second template under the same name', async () => {
    await createBoardTemplate({ name: 'Ops', columns: COLUMNS, byId })
    await expect(createBoardTemplate({ name: 'Ops', columns: COLUMNS, byId })).rejects.toMatchObject({ status: 409 })
  })
})

describe('createBoardTemplate missingStatus @SC-170', () => {
  it('refuses columns without one of the three states, naming it', async () => {
    await expect(createBoardTemplate({ name: 'Bad', columns: COLUMNS.filter(c => c.status !== 'DONE'), byId }))
      .rejects.toThrow(/missing DONE/)
  })
})

describe('updateBoardTemplate @SC-029', () => {
  it('publishes the next version, keeping the columns not edited', async () => {
    const tpl = await createBoardTemplate({ name: 'Meta', description: 'before', columns: COLUMNS, byId })
    const updated = await updateBoardTemplate({ id: tpl.id, name: 'Renamed', description: 'after', byId })
    expect(updated).toMatchObject({ name: 'Renamed', description: 'after', version: '1.1.0' })
    expect((await getBoardTemplate(tpl.id))?.columns).toHaveLength(3)
    expect(await prisma.assetVersion.count({ where: { assetId: tpl.id } })).toBe(2)
  })
})

describe('updateBoardTemplate validation @SC-171', () => {
  it('refuses an edit that drops a state', async () => {
    const tpl = await createBoardTemplate({ name: 'Edit', columns: COLUMNS, byId })
    await expect(updateBoardTemplate({ id: tpl.id, columns: COLUMNS.filter(c => c.status !== 'IN_PROGRESS'), byId }))
      .rejects.toThrow(/missing IN_PROGRESS/)
  })
})

describe("Agenthix's templates @SC-172 @SC-173", () => {
  it('are neither edited nor removed here', async () => {
    const { assetId } = await seedTemplate(prisma, 'BOARD', 'kanban', boardPackage('kanban'))
    await expect(updateBoardTemplate({ id: assetId, name: 'Renamed', byId })).rejects.toThrow(TemplateValidationError)
    await expect(deleteBoardTemplate(assetId, byId)).rejects.toThrow(TemplateValidationError)
    expect((await prisma.asset.findUnique({ where: { id: assetId } }))?.removedAt).toBeNull()
  })

  it('removing the organisation\'s own keeps its history', async () => {
    const tpl = await createBoardTemplate({ name: 'Del', columns: COLUMNS, byId })
    await deleteBoardTemplate(tpl.id, byId)
    expect(await prisma.asset.findUnique({ where: { id: tpl.id } })).toMatchObject({ removedById: byId })
    expect(await prisma.assetVersion.count({ where: { assetId: tpl.id } })).toBe(1)
    expect(await listBoardTemplates()).toEqual([])
  })
})

describe('a board made from a template', () => {
  it('copies its columns and keeps the version it was made from, never following later versions', async () => {
    const tpl = await createBoardTemplate({ name: 'Flow', columns: COLUMNS, byId })
    const project = await createProject()
    const made = await boardTemplateColumns(tpl.id)
    const board = await createBoard({ projectId: project.id, name: 'Work', madeFromVersionId: made?.madeFromVersionId, columns: made?.columns })
    const first = (await prisma.asset.findUnique({ where: { id: tpl.id } }))!.currentVersionId
    expect(board.madeFromVersionId).toBe(first)

    await updateBoardTemplate({ id: tpl.id, columns: [...COLUMNS, { ...COLUMNS[1], name: 'review', label: 'Review' }], byId })
    const after = await prisma.board.findUniqueOrThrow({ where: { id: board.id } })
    expect(after.madeFromVersionId).toBe(first)
    expect(after.columns as unknown[]).toHaveLength(3)
  })

  it('finds Agenthix\'s template by the names team templates use', async () => {
    const { versionId } = await seedTemplate(prisma, 'BOARD', 'kanban', boardPackage('kanban'))
    for (const ref of ['kanban', 'agenthix/kanban']) {
      expect((await boardTemplateColumns(ref))?.madeFromVersionId).toBe(versionId)
    }
    // The names from before board templates were assets are gone.
    for (const ref of ['does-not-exist', 'sys-tpl-0001-kanban']) expect(await boardTemplateColumns(ref)).toBeNull()
  })
})
