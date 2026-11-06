import { describe, it, expect, vi } from 'vitest'
import { createNewTask, createArgs, freshProgress, type NewTaskActions } from '../createNewTask'
import { emptyNewTask } from '../newTaskState'

const actions = (over: Partial<NewTaskActions> = {}): NewTaskActions => ({
  createTask: vi.fn().mockResolvedValue({ id: 't1', number: 7 }),
  updateTaskPlan: vi.fn().mockResolvedValue({}),
  setTaskSchedule: vi.fn().mockResolvedValue({}),
  makeTaskRoutine: vi.fn().mockResolvedValue({}),
  uploadFile: vi.fn().mockResolvedValue({}),
  ...over,
})

describe('making a new task', () => {
  it('sends the model only with an agent, and no column without a board', () => {
    const v = { ...emptyNewTask(), title: ' Ship ', modelChoice: 'p/opus' }
    expect(createArgs('p1', v, null)).toEqual({ projectId: 'p1', title: 'Ship', priority: 'MEDIUM' })
    expect(createArgs('p1', { ...v, agentId: 'a1' }, 'w1')).toMatchObject({ assignedAgentId: 'a1', modelChoice: 'p/opus', workspaceId: 'w1' })
  })

  it('applies the epic through the plan after making the task', async () => {
    const a = actions()
    const made = await createNewTask('p1', { ...emptyNewTask({ epicId: 'e1' }), title: 'x' }, null, a, freshProgress())
    expect(made).toEqual({ id: 't1', number: 7 })
    expect(a.updateTaskPlan).toHaveBeenCalledWith({ taskId: 't1', epicId: 'e1' })
    expect(a.setTaskSchedule).not.toHaveBeenCalled()
  })

  it('makes a routine for a repeat and a start time otherwise', async () => {
    const a = actions()
    await createNewTask('p1', { ...emptyNewTask(), title: 'x', startsAt: '2030-01-02T09:30', repeat: 'daily' }, null, a, freshProgress())
    expect(a.makeTaskRoutine).toHaveBeenCalledOnce()
    expect(a.setTaskSchedule).not.toHaveBeenCalled()
    const b = actions()
    await createNewTask('p1', { ...emptyNewTask(), title: 'x', startsAt: '2030-01-02T09:30' }, null, b, freshProgress())
    expect(b.setTaskSchedule).toHaveBeenCalledOnce()
  })

  it('carries on after a failure without making the task twice', async () => {
    const upload = vi.fn().mockRejectedValueOnce(new Error('Too big. Nothing was changed.')).mockResolvedValue({})
    const a = actions({ uploadFile: upload })
    const v = { ...emptyNewTask({ epicId: 'e1' }), title: 'x', files: [new File(['a'], 'a.png')] }
    const progress = freshProgress()
    await expect(createNewTask('p1', v, null, a, progress)).rejects.toThrow('Too big')
    await createNewTask('p1', v, null, a, progress)
    expect(a.createTask).toHaveBeenCalledTimes(1)
    expect(a.updateTaskPlan).toHaveBeenCalledTimes(1)
    expect(upload).toHaveBeenCalledTimes(2)
  })
})
