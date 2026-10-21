/**
 * The previews running in a place, for the Workspaces tool: only running ones,
 * only that place's, and only for someone who may reach it.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUser } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})

import { listPlacePreviewsQuery } from '../placePreviewsQuery'

let seq = 0
const inAnHour = () => new Date(Date.now() + 3_600_000)
function preview(data: Record<string, unknown>) {
  seq += 1
  return prisma.previewSession.create({
    data: { token: `tok-${seq}`, agentId: 'a1', siteId: 's1', previewId: `pv-${seq}`, command: 'npm run dev', status: 'running', expiresAt: inAnHour(), ...data },
  })
}

describe('a place\'s running previews', () => {
  it('lists the running previews of the person\'s own space, with their workspace', async () => {
    const me = await createUser()
    const running = await preview({ ownerType: 'user', ownerId: me.id, workspaceId: 'ws-1' })
    await preview({ ownerType: 'user', ownerId: me.id, workspaceId: 'ws-2', status: 'expired' })
    await preview({ ownerType: 'user', ownerId: me.id, workspaceId: 'ws-3', expiresAt: new Date(Date.now() - 1000) })
    const other = await createUser()
    await preview({ ownerType: 'user', ownerId: other.id, workspaceId: 'ws-9' })

    const { previews } = await listPlacePreviewsQuery({ ownerType: 'user', ownerId: me.id }, { user: { id: me.id } })

    expect(previews).toEqual([{ id: running.id, workspaceId: 'ws-1' }])
  })

  it('refuses someone who may not reach the place', async () => {
    const me = await createUser()
    const stranger = await createUser()
    await expect(listPlacePreviewsQuery({ ownerType: 'user', ownerId: me.id }, { user: { id: stranger.id } })).rejects.toMatchObject({ statusCode: 403 })
    // Only a project's members reach it, open or private (adr-0099).
    for (const accessLevel of ['PRIVATE', 'OPEN'] as const) {
      const project = await createProject({ accessLevel })
      await expect(listPlacePreviewsQuery({ ownerType: 'project', ownerId: project.id }, { user: { id: stranger.id } })).rejects.toMatchObject({ statusCode: 403 })
    }
  })
})
