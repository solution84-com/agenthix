import { describe, it, expect, vi } from 'vitest'
import { createNewTask, createArgs, freshProgress, type NewTaskActions } from '../createNewTask'
import { emptyNewTask } from '../newTaskState'

const actions = (over: Partial<NewTaskActions> = {}): NewTaskActions => ({
  createTask: vi.fn().mockResolvedValue({ id: 't1', number: 7 }),
  updateTaskPlan: vi.fn().mockResolvedValue({}),
  setTaskSchedule: vi.fn().mockResolvedValue({}),
  uploadFile: vi.fn().mockResolvedValue({}),
  addTasksToSprint: vi.fn().mockResolvedValue({}),
  setTaskFieldValue: vi.fn().mockResolvedValue({}),
  ...over,
})

describe('making a new task', () => {
  it('sends its type, the model only with an agent, and a column only when it was added from one (N2)', () => {
    const v = { ...emptyNewTask(), typeId: 'bug', title: ' Ship ', modelChoice: 'p/opus' }
    expect(createArgs('p1', v, null)).toEqual({ projectId: 'p1', title: 'Ship', priority: 'MEDIUM', typeId: 'bug' })
    expect(createArgs('p1', { ...v, agentId: 'a1' }, 'w1')).toMatchObject({ assignedAgentId: 'a1', modelChoice: 'p/opus', workspaceId: 'w1' })
    expect(createArgs('p1', { ...v, columnId: 'fix' }, null)).toMatchObject({ typeId: 'bug', columnId: 'fix' })
    expect(createArgs('p1', v, null)).not.toHaveProperty('boardId')
  })

  it('applies the epic through the plan after making the task', async () => {
    const a = actions()
    const made = await createNewTask('p1', { ...emptyNewTask({ epicId: 'e1' }), title: 'x' }, null, a, freshProgress())
    expect(made).toEqual({ id: 't1', number: 7 })
    expect(a.updateTaskPlan).toHaveBeenCalledWith({ taskId: 't1', epicId: 'e1' })
    expect(a.setTaskSchedule).not.toHaveBeenCalled()
  })

  it('plans it into the chosen sprint (the server moves a Backlog task to To do, N1) and sets its custom fields', async () => {
    const a = actions()
    await createNewTask('p1', { ...emptyNewTask(), title: 'x', sprintId: 's2', fields: { f1: 'o1', f2: '' } }, null, a, freshProgress())
    expect(a.addTasksToSprint).toHaveBeenCalledWith({ sprintId: 's2', taskIds: ['t1'] })
    expect(a.setTaskFieldValue).toHaveBeenCalledTimes(1)
    expect(a.setTaskFieldValue).toHaveBeenCalledWith({ taskId: 't1', fieldId: 'f1', optionId: 'o1' })
  })

  it('plans no sprint and sets no field when none was chosen', async () => {
    const a = actions()
    await createNewTask('p1', { ...emptyNewTask(), title: 'x' }, null, a, freshProgress())
    expect(a.addTasksToSprint).not.toHaveBeenCalled()
    expect(a.setTaskFieldValue).not.toHaveBeenCalled()
  })

  it('sets its due date through the plan and its start time through Run at…', async () => {
    const a = actions()
    await createNewTask('p1', { ...emptyNewTask(), title: 'x', due: '2030-01-05', startsAt: '2030-01-02T09:30' }, null, a, freshProgress())
    expect(a.updateTaskPlan).toHaveBeenCalledWith({ taskId: 't1', planFinish: '2030-01-05' })
    expect(a.setTaskSchedule).toHaveBeenCalledWith({ taskId: 't1', at: new Date('2030-01-02T09:30').toISOString() })
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
