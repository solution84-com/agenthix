/**
 * What a private project shows to whom (spec §6.4, SC-304, SC-397, R-107,
 * R-110), against the real test DB. A private project the caller is not on is
 * not listed, and every read of it or its boards and tasks answers an outsider
 * exactly as it answers a thing that does not exist — never "forbidden", and
 * never with the key or id it was asked about.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUser, createUserWithRole } from '../../test/factories'
import { ctx, makeBoard, makeTask } from './projectsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import {
  getProjects, getProject, getProjectByKey, getBoards, getBoard, getTasks, getTask, getTaskByKey,
  getTaskComments,
} from '../queries'
import { getProjectBoards } from '../boardOperations'
import { getProjectSprints } from '../sprintOperations'
import { getMilestones } from '../planOperations'
import { getTimeline } from '../timeline'

async function privateCast() {
  const member = await createUser()
  const outsider = await createUserWithRole('ADMIN')
  const project = await createProject({ accessLevel: 'PRIVATE', key: 'DASH' })
  await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id } })
  const board = await makeBoard(project.id)
  const task = await makeTask(project.id, { number: 42 })
  return { member, outsider, project, board, task }
}
type Cast = Awaited<ReturnType<typeof privateCast>>

describe("a private project's contents follow its visibility", () => {
  const cases: Array<[string, (c: Cast, id: 'real' | 'missing', x: any) => unknown, string]> = [
    ['getBoards', (c, id, x) => getBoards({ projectId: id === 'real' ? c.project.id : 'gone' }, x), 'Project not found'],
    ['getBoard', (c, id, x) => getBoard({ boardId: id === 'real' ? c.board.id : 'gone' }, x), 'Board not found'],
    ['getBoard by the project', (c, id, x) => getBoard({ boardId: id === 'real' ? c.project.id : 'gone' }, x), 'Board not found'],
    ['getProjectBoards', (c, id, x) => getProjectBoards({ projectId: id === 'real' ? c.project.id : 'gone' }, x), 'Project not found'],
    ['getProjectSprints', (c, id, x) => getProjectSprints({ projectId: id === 'real' ? c.project.id : 'gone' }, x), 'Project not found'],
    ['getMilestones', (c, id, x) => getMilestones({ projectId: id === 'real' ? c.project.id : 'gone' }, x), 'Project not found'],
    ['getTimeline', (c, id, x) => getTimeline({ projectId: id === 'real' ? c.project.id : 'gone', from: '2026-10-01', to: '2026-11-01' }, x), 'Project not found'],
    ['getTasks', (c, id, x) => getTasks({ projectId: id === 'real' ? c.project.id : 'gone' }, x), 'Project not found'],
    ['getTask', (c, id, x) => getTask({ taskId: id === 'real' ? c.task.id : 'gone' }, x), 'Task not found'],
    ['getTaskComments', (c, id, x) => getTaskComments({ taskId: id === 'real' ? c.task.id : 'gone' }, x), 'Task not found'],
    ['getProject', (c, id, x) => getProject({ projectId: id === 'real' ? c.project.id : 'gone' }, x), 'Project not found'],
  ]

  for (const [name, call, notFound] of cases) {
    it(`${name} answers an outsider exactly as it answers a thing that does not exist`, async () => {
      const c = await privateCast()
      const hidden = await Promise.resolve(call(c, 'real', ctx(c.outsider))).catch((e: Error) => e)
      const missing = await Promise.resolve(call(c, 'missing', ctx(c.outsider))).catch((e: Error) => e)
      expect(hidden).toMatchObject({ statusCode: 404, message: notFound })
      expect(missing).toMatchObject({ statusCode: 404, message: notFound })
    })

    it(`${name} serves a member`, async () => {
      const c = await privateCast()
      await expect(Promise.resolve(call(c, 'real', ctx(c.member)))).resolves.toBeDefined()
    })
  }

  it('getProject and getBoard serve a member what is in them', async () => {
    const c = await privateCast()
    expect((await getProject({ projectId: c.project.id }, ctx(c.member))).tasks.map((t: { id: string }) => t.id)).toEqual([c.task.id])
    const board = await getBoard({ boardId: c.board.id }, ctx(c.member))
    expect([...board.tasks, ...board.backlog].map(t => t.id)).toEqual([c.task.id])
  })
})

describe('listing and finding projects @SC-304', () => {
  it('getProjects lists only the projects the caller is entitled to', async () => {
    const c = await privateCast()
    const open = await createProject({ accessLevel: 'OPEN' })
    expect((await getProjects(undefined, ctx(c.outsider))).map((p: { id: string }) => p.id)).toEqual([open.id])
    expect((await getProjects(undefined, ctx(c.member))).map((p: { id: string }) => p.id).sort()).toEqual([open.id, c.project.id].sort())
  })

  // A key is guessable, so a hidden project answers as an unknown key.
  it('getProjectByKey answers a project the caller may not see exactly as an unknown key, naming neither', async () => {
    const c = await privateCast()
    const hidden = await Promise.resolve(getProjectByKey({ key: 'DASH' }, ctx(c.outsider))).catch((e: Error) => e)
    const unknown = await Promise.resolve(getProjectByKey({ key: 'NOPE' }, ctx(c.outsider))).catch((e: Error) => e)
    expect(hidden).toMatchObject({ statusCode: 404 })
    expect((hidden as Error).message).toBe((unknown as Error).message)
    expect((hidden as Error).message).not.toContain('DASH')
    expect((unknown as Error).message).not.toContain('NOPE')
    expect((await getProjectByKey({ key: 'DASH' }, ctx(c.member))).id).toBe(c.project.id)
  })

  it('getTaskByKey answers a non-member of an existing project and a missing project identically, naming neither', async () => {
    const c = await privateCast()
    expect((await getTaskByKey({ taskKey: 'DASH-42' }, ctx(c.member))).id).toBe(c.task.id)
    const hidden = await Promise.resolve(getTaskByKey({ taskKey: 'DASH-42' }, ctx(c.outsider))).catch((e: Error) => e)
    const missing = await Promise.resolve(getTaskByKey({ taskKey: 'NOPE-42' }, ctx(c.outsider))).catch((e: Error) => e)
    expect(hidden).toMatchObject({ statusCode: 404 })
    expect((hidden as Error).message).toBe((missing as Error).message)
    expect((hidden as Error).message).not.toContain('DASH')
  })

  it('each project read rejects a caller who is not signed in', async () => {
    const c = await privateCast()
    await expect(Promise.resolve(getProjects(undefined, ctx(null)))).rejects.toMatchObject({ statusCode: 401 })
    await expect(Promise.resolve(getProject({ projectId: c.project.id }, ctx(null)))).rejects.toMatchObject({ statusCode: 401 })
    await expect(Promise.resolve(getProjectByKey({ key: 'DASH' }, ctx(null)))).rejects.toMatchObject({ statusCode: 401 })
  })
})
