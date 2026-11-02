/**
 * Archiving hq's copy of a task's session for a site that is gone for good (R-059), against the real database:
 * no site is asked, the session's previews end, and nothing changes for a task with no session or one already
 * archived.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createSession } from '../../test/factories'
import { addTask, agentInProject } from './taskRunFixtures'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { archiveTaskSessionOnHq } from '../taskSessionArchive'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

describe('archiveTaskSessionOnHq — R-059', () => {
  async function taskWithSession(status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE') {
    const where = await agentInProject()
    const task = await addTask(where)
    const session = await createSession({ agentId: where.agent.id, userId: where.person.id, sessionType: 'task', taskId: task.id, status })
    return { task, session }
  }

  it("archives hq's copy of the task's session, without asking any site", async () => {
    const { task, session } = await taskWithSession()
    await archiveTaskSessionOnHq(task.id)
    expect((await prisma.agentSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe('ARCHIVED')
    expect(siteStore.archiveSession).not.toHaveBeenCalled()
  })

  it('does nothing for a task with no session, or one already archived', async () => {
    const where = await agentInProject()
    await expect(archiveTaskSessionOnHq((await addTask(where)).id)).resolves.toBeUndefined()
    const { task, session } = await taskWithSession('ARCHIVED')
    await archiveTaskSessionOnHq(task.id)
    expect((await prisma.agentSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe('ARCHIVED')
  })
})
