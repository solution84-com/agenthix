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
    await prisma.previewSession.create({
      data: { token: `tok-${session.id}`, agentId: where.agent.id, sessionId: session.id, siteId: 'site-1', previewId: 'p', command: 'npm run dev', status: 'running', expiresAt: new Date(Date.now() + 3_600_000) },
    })
    return { task, session }
  }
  const previewOf = async (sessionId: string) => (await prisma.previewSession.findFirstOrThrow({ where: { sessionId } })).status

  it("archives hq's copy of the task's session and ends its previews, without asking any site", async () => {
    const { task, session } = await taskWithSession()
    await archiveTaskSessionOnHq(task.id)
    expect((await prisma.agentSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe('ARCHIVED')
    expect(await previewOf(session.id)).toBe('stopping')
    expect(siteStore.archiveSession).not.toHaveBeenCalled()
  })

  it('does nothing for a task with no session, or one already archived', async () => {
    const where = await agentInProject()
    await expect(archiveTaskSessionOnHq((await addTask(where)).id)).resolves.toBeUndefined()
    const { task, session } = await taskWithSession('ARCHIVED')
    await archiveTaskSessionOnHq(task.id)
    expect(await previewOf(session.id)).toBe('running')
  })

  it('a preview that will not end does not undo the archive or throw', async () => {
    const { task, session } = await taskWithSession()
    const previews = vi.spyOn(prisma.previewSession, 'findMany').mockRejectedValueOnce(new Error('registry down'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await expect(archiveTaskSessionOnHq(task.id)).resolves.toBeUndefined()
    } finally {
      previews.mockRestore()
      warn.mockRestore()
    }
    expect((await prisma.agentSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe('ARCHIVED')
  })
})
