import { describe, it, expect, vi, beforeEach } from 'vitest'

const prisma = vi.hoisted(() => ({
  task: { findUnique: vi.fn(), findFirst: vi.fn() },
}))
vi.mock('wasp/server', () => ({ prisma }))

import { taskIdFor, withTaskId } from '../taskKey'

beforeEach(() => {
  prisma.task.findUnique.mockReset().mockResolvedValue(null)
  prisma.task.findFirst.mockReset().mockResolvedValue(null)
})

describe('taskIdFor', () => {
  it('takes an id as it is', async () => {
    prisma.task.findUnique.mockResolvedValue({ id: 't1' })
    expect(await taskIdFor(' t1 ')).toEqual({ taskId: 't1' })
    expect(prisma.task.findFirst).not.toHaveBeenCalled()
  })

  it('finds a task by its key in any case', async () => {
    prisma.task.findFirst.mockResolvedValue({ id: 't2' })
    expect(await taskIdFor('wal-2')).toEqual({ taskId: 't2' })
    expect(prisma.task.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { number: 2, project: { key: 'WAL' } } }))
  })

  it('refuses words that name no task, saying so', async () => {
    expect(await taskIdFor('WAL-2')).toEqual({ refusal: expect.stringMatching(/no task with the key or id "WAL-2"/) })
    expect(await taskIdFor('nonsense')).toEqual({ refusal: expect.stringMatching(/no task/) })
  })
})

describe('withTaskId', () => {
  it('replaces a key with the id and keeps the other arguments', async () => {
    prisma.task.findFirst.mockResolvedValue({ id: 't2' })
    expect(await withTaskId({ taskId: 'WAL-2', title: 'x' })).toEqual({ taskId: 't2', title: 'x' })
  })

  it('passes arguments with no taskId as they came', async () => {
    const args = { projectId: 'p' }
    expect(await withTaskId(args)).toBe(args)
    expect(await withTaskId(undefined)).toBeUndefined()
  })

  it('throws not_found for a key that names no task', async () => {
    await expect(withTaskId({ taskId: 'WAL-9' })).rejects.toMatchObject({ code: 'not_found' })
  })
})
