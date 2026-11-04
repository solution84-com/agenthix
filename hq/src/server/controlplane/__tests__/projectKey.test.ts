import { describe, it, expect, vi, beforeEach } from 'vitest'

const prisma = vi.hoisted(() => ({ project: { findUnique: vi.fn() } }))
vi.mock('wasp/server', () => ({ prisma }))

import { withProjectId } from '../projectKey'

beforeEach(() => { prisma.project.findUnique.mockReset().mockResolvedValue(null) })

describe('withProjectId', () => {
  it('replaces a key, in any case, with the project\'s id and keeps the other arguments', async () => {
    prisma.project.findUnique.mockImplementation(async ({ where }: { where: { id?: string; key?: string } }) => (where.key === 'WAL' ? { id: 'p1' } : null))
    expect(await withProjectId({ projectId: 'wal', title: 'x' })).toEqual({ projectId: 'p1', title: 'x' })
  })

  it('keeps an id as it is', async () => {
    prisma.project.findUnique.mockImplementation(async ({ where }: { where: { id?: string } }) => (where.id === 'abc123' ? { id: 'abc123' } : null))
    const args = { projectId: 'abc123' }
    expect(await withProjectId(args)).toBe(args)
    expect(prisma.project.findUnique).toHaveBeenCalledTimes(1)
  })

  it('leaves a uuid-shaped or unknown value for the operation to refuse, without a lookup for the former', async () => {
    const uuid = { projectId: '0b9f2c1e-0000-4000-8000-000000000000' }
    expect(await withProjectId(uuid)).toBe(uuid)
    expect(prisma.project.findUnique).not.toHaveBeenCalled()
    const unknown = { projectId: 'NOPE' }
    expect(await withProjectId(unknown)).toBe(unknown)
  })

  it('passes arguments with no projectId as they came', async () => {
    const args = { taskId: 't' }
    expect(await withProjectId(args)).toBe(args)
    expect(await withProjectId(undefined)).toBeUndefined()
    expect(await withProjectId({ projectId: 3 })).toEqual({ projectId: 3 })
  })
})
