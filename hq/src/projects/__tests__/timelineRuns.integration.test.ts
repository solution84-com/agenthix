/**
 * The timeline's run slices, against the real test DB and the shared site fake: the site is asked for the
 * range's tasks' runs only, so a busy site's other history cannot crowd them out or mark them truncated.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUser, ensureExecutionSite } from '../../test/factories'
import { makeBoard, makeTask } from './projectsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { addRun, listRunsPage } from '../../test/fakes/siteRuntimeStore'
import { readTimeline } from '../timeline'
import { timelineRange } from '../timelineRange'

const range = timelineRange('2026-10-01', '2026-11-01')
const now = new Date('2026-10-20T12:00:00.000Z')

async function cast() {
  const site = await ensureExecutionSite()
  const project = await createProject()
  const person = await createUser()
  const board = await makeBoard(project.id)
  const task = await makeTask(project.id, { boardId: board.id, column: 'todo', onBehalfOfUserId: person.id })
  return { site, project, board, task }
}

describe('the timeline asks the site for the range tasks runs only @SC-565', () => {
  it('names the tasks it shows, and reads their slices past a busy site\'s other history', async () => {
    const { site, project, task } = await cast()
    addRun(site.siteId, { id: 'mine', taskId: task.id, startedAt: '2026-10-05T09:00:00.000Z', endedAt: '2026-10-05T10:00:00.000Z', createdAt: '2026-10-05T09:00:00.000Z' })
    // More newer runs of other tasks than one page holds: unfiltered, they would push `mine` off the page.
    for (let i = 0; i < 1001; i++) {
      const at = new Date(Date.UTC(2026, 9, 10, 0, 0, 0, i)).toISOString()
      addRun(site.siteId, { id: `other-${i}`, taskId: 'someone-elses', startedAt: at, endedAt: at, createdAt: at })
    }

    const { runs } = await readTimeline(project.id, null, range, now)

    expect(listRunsPage).toHaveBeenCalledWith(site.siteId, expect.objectContaining({ taskIds: [task.id] }))
    expect(runs).toMatchObject({ unavailable: null, truncated: false })
    expect(runs.slices.map(s => s.runId)).toEqual(['mine'])
  })

  it('is truncated only when the range tasks runs are themselves over the page size', async () => {
    const { site, project, task } = await cast()
    for (let i = 0; i < 1001; i++) {
      const at = new Date(Date.UTC(2026, 9, 10, 0, 0, 0, i)).toISOString()
      addRun(site.siteId, { id: `mine-${i}`, taskId: task.id, startedAt: at, endedAt: at, createdAt: at })
    }

    const { runs } = await readTimeline(project.id, null, range, now)

    expect(runs.truncated).toBe(true)
    expect(runs.slices).toHaveLength(1000)
  })
})
