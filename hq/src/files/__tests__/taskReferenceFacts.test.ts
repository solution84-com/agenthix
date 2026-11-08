/** What task chips are told (spec part 3, *Tasks and their files*): access before anything, one answer for no task and a hidden one. */
import { describe, it, expect, vi } from 'vitest'
import type { SiteFileRef } from '@agenthix/core'
import { taskReferenceFacts, type FoundTask, type TaskReferenceDeps } from '../taskReferenceFacts'

const visible: FoundTask = { id: 't1', key: 'MOP-1', title: 'Fix the form', state: 'TODO', projectId: 'p1', yourSpace: false }
const hidden: FoundTask = { id: 't2', key: 'SEC-1', title: 'Secret plan', state: 'TODO', projectId: 'p2', yourSpace: false }
const space: FoundTask = { id: 't3', key: 'SAM-1', title: 'Mine', state: 'DONE', projectId: 'p3', yourSpace: true }
const facts = { name: 'notes.md', size: 3, version: '3:1', contentType: 'text/markdown', kind: 'markdown' as const }

function deps(over: Partial<TaskReferenceDeps> = {}) {
  const tasks = [visible, hidden, space]
  const d: TaskReferenceDeps = {
    findTask: vi.fn(async (name: string) => tasks.find(t => t.key === name || t.id === name) ?? null),
    canSee: async projectId => projectId !== 'p2',
    fileFacts: vi.fn(async (refs: SiteFileRef[]) => refs.map(() => ({ state: 'ready' as const, facts }))),
    findAttachment: vi.fn(async (_taskId: string, name: string) => (name === 'a.png' ? { id: 'att-1', uploadPath: '/files/task/t1/u/a.png', name } : null)),
    attachmentFacts: vi.fn(async () => ({ state: 'ready' as const, facts: { ...facts, name: 'a.png', kind: 'image' as const, contentType: 'image/png' } })),
    ...over,
  }
  return d
}

const task = (t: FoundTask) => ({ id: t.id, key: t.key, title: t.title, state: t.state })

describe('task chip facts @SC-1517', () => {
  it("answers a task's facts, finding each task once however often it is named", async () => {
    const d = deps()
    const answers = await taskReferenceFacts([{ kind: 'task', task: 'MOP-1' }, { kind: 'task', task: 'MOP-1' }], 'u1', d)
    expect(answers).toEqual([{ state: 'task', task: task(visible) }, { state: 'task', task: task(visible) }])
    expect(d.findTask).toHaveBeenCalledTimes(1)
  })

  it('answers not-found for a task the person may not see and for no task, asking after none of its files', async () => {
    const d = deps()
    const answers = await taskReferenceFacts([
      { kind: 'task', task: 'SEC-1' }, { kind: 'working', task: 'SEC-1', path: 'x.md' }, { kind: 'attachment', task: 'SEC-1', name: 'a.png' },
      { kind: 'task', task: 'NOPE-9' },
    ], 'u1', d)
    expect(answers).toEqual([{ state: 'not-found' }, { state: 'not-found' }, { state: 'not-found' }, { state: 'not-found' }])
    expect(d.fileFacts).not.toHaveBeenCalled()
    expect(d.findAttachment).not.toHaveBeenCalled()
  })

  it("asks a working file's facts in the task's own folder, all in one request", async () => {
    const d = deps()
    const answers = await taskReferenceFacts([{ kind: 'working', task: 'MOP-1', path: 'out/notes.md' }, { kind: 'working', task: 't1', path: 'b.md' }], 'u1', d)
    const loc = { ownerType: 'project', ownerId: 'p1', workspaceId: null, taskId: 't1' }
    expect(d.fileFacts).toHaveBeenCalledTimes(1)
    expect(d.fileFacts).toHaveBeenCalledWith([{ space: 'place', loc, path: 'out/notes.md' }, { space: 'place', loc, path: 'b.md' }], 'u1')
    expect(answers[0]).toEqual({ state: 'working', task: task(visible), loc, path: 'out/notes.md', file: { state: 'ready', facts } })
  })

  it('answers a working file of a task of Your space as not found: it has no folder to open by task', async () => {
    const d = deps()
    const [answer] = await taskReferenceFacts([{ kind: 'working', task: 'SAM-1', path: 'a.md' }], 'u1', d)
    expect(answer).toEqual({ state: 'working', task: task(space), loc: null, path: 'a.md', file: { state: 'not-found' } })
    expect(d.fileFacts).not.toHaveBeenCalled()
  })

  it("answers an attachment's facts and id, and gone when the task has none by that name", async () => {
    const answers = await taskReferenceFacts([{ kind: 'attachment', task: 'MOP-1', name: 'a.png' }, { kind: 'attachment', task: 'MOP-1', name: 'b.png' }], 'u1', deps())
    expect(answers[0]).toMatchObject({ state: 'attachment', attachmentId: 'att-1', file: { state: 'ready', facts: { name: 'a.png' } } })
    expect(answers[1]).toEqual({ state: 'attachment', task: task(visible), attachmentId: null, file: { state: 'gone' } })
  })
})
