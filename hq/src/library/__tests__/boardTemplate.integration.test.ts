import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { prisma } from '../../test/db'

// Board template CRUD + validation against the real test DB (ADR-0035). The
// service writes stage JSON under getBoardTemplatesDir(); we point
// HQ_STORAGE_ROOT at a temp dir so those writes are isolated. `wasp/server` is
// mocked to the real test-DB client.

let TMP_ROOT: string

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})

import {
  createBoardTemplate,
  updateBoardTemplate,
  deleteBoardTemplate,
  listBoardTemplates,
  TemplateValidationError,
} from '../boardTemplateService'

let n = 0
function fullColumns() {
  return [
    { name: 'todo', label: 'To Do', status: 'TODO' as const, color: '#000', order: 0, description: '' },
    { name: 'doing', label: 'In Progress', status: 'IN_PROGRESS' as const, color: '#111', order: 1, description: '' },
    { name: 'done', label: 'Done', status: 'DONE' as const, color: '#222', order: 2, description: '' },
  ]
}

beforeAll(async () => {
  TMP_ROOT = await fs.mkdtemp(path.join(os.tmpdir(), 'bt-test-'))
  process.env.HQ_STORAGE_ROOT = TMP_ROOT
})
afterAll(async () => {
  await fs.rm(TMP_ROOT, { recursive: true, force: true })
})
beforeEach(() => vi.clearAllMocks())

describe('createBoardTemplate @SC-029', () => {
  // SC-029 — user can create and browse org board templates.
  it('creates an org template and it appears in the list', async () => {
    const tpl = await createBoardTemplate({ name: `Tpl ${n++}`, columns: fullColumns() })
    expect(tpl.isSystem).toBe(false)
    const all = await listBoardTemplates()
    expect(all.map(t => t.id)).toContain(tpl.id)
  })
})

describe('createBoardTemplate missingStatus @SC-170', () => {
  // SC-170 — creating a template missing any of TODO / IN_PROGRESS / DONE is
  // rejected, naming the missing statuses.
  it('rejects a template missing the DONE status', async () => {
    const columns = fullColumns().filter(s => s.status !== 'DONE')
    await expect(createBoardTemplate({ name: 'Bad', columns }))
      .rejects.toThrow(/missing DONE/)
  })
})

describe('updateBoardTemplate metadata sync @SC-029', () => {
  // F-031 — a name/description-only edit must update the on-disk JSON too, not
  // just the DB row, or the file and DB drift.
  it('writes name/description changes to the on-disk JSON', async () => {
    const tpl = await createBoardTemplate({ name: `Meta ${n++}`, description: 'before', columns: fullColumns() })

    await updateBoardTemplate({ id: tpl.id, name: 'Renamed', description: 'after' })

    const updated = await prisma.boardTemplate.findUnique({ where: { id: tpl.id } })
    expect(updated?.name).toBe('Renamed')
    expect(updated?.description).toBe('after')

    const filePath = path.join(TMP_ROOT, updated!.assetPath)
    const onDisk = JSON.parse(await fs.readFile(filePath, 'utf-8'))
    expect(onDisk.name).toBe('Renamed')
    expect(onDisk.description).toBe('after')
    // Stages were not part of the edit — they must be preserved unchanged.
    expect(onDisk.columns).toHaveLength(3)
  })
})

describe('updateBoardTemplate validation @SC-171', () => {
  // SC-171 — editing a template re-runs the coverage validation and rejects an
  // incomplete set.
  it('rejects an edit that drops a required status', async () => {
    const tpl = await createBoardTemplate({ name: `Edit ${n++}`, columns: fullColumns() })
    const incomplete = fullColumns().filter(s => s.status !== 'IN_PROGRESS')
    await expect(updateBoardTemplate({ id: tpl.id, columns: incomplete }))
      .rejects.toThrow(/missing IN_PROGRESS/)
  })
})

describe('updateBoardTemplate system @SC-172', () => {
  // SC-172 — editing a built-in (system) board template is rejected.
  it('rejects editing a system template', async () => {
    const sys = await prisma.boardTemplate.create({
      data: { name: 'System', description: '', assetPath: 'assets/library/boards/sys.json', isSystem: true } as any,
    })
    await expect(updateBoardTemplate({ id: sys.id, name: 'Renamed' }))
      .rejects.toThrow(TemplateValidationError)
  })
})

describe('deleteBoardTemplate system @SC-173', () => {
  // SC-173 — deleting a built-in (system) board template is rejected.
  it('rejects deleting a system template', async () => {
    const sys = await prisma.boardTemplate.create({
      data: { name: 'System', description: '', assetPath: 'assets/library/boards/sys.json', isSystem: true } as any,
    })
    await expect(deleteBoardTemplate(sys.id)).rejects.toThrow(TemplateValidationError)
    expect(await prisma.boardTemplate.findUnique({ where: { id: sys.id } })).not.toBeNull()
  })

  it('deletes an org template', async () => {
    const tpl = await createBoardTemplate({ name: `Del ${n++}`, columns: fullColumns() })
    await deleteBoardTemplate(tpl.id)
    expect(await prisma.boardTemplate.findUnique({ where: { id: tpl.id } })).toBeNull()
  })
})
