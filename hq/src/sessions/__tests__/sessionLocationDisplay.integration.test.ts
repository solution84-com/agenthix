/**
 * The working-context badge is what an operator reads to answer "is this agent
 * in my files?". It is pure display and reaches no disk, so a wrong answer here
 * is not an access defect — but it asserts to a person exactly the thing the
 * location resolver decides, and the two must not say different things.
 * Against the real test DB.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createTestTask } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

vi.mock('../../storage/workspaceStore', async () => {
  const actual = await vi.importActual<typeof import('../../storage/workspaceStore')>('../../storage/workspaceStore')
  return { ...actual, getWorkspace: vi.fn(async () => ({ name: 'website' })) }
})

import { resolveSessionLocationDisplay } from '../sessionLocationDisplay'

describe('a session with a location of its own', () => {
  it('names the project and its files', async () => {
    const project = await createProject({ name: 'Web App', key: 'WEB' })
    const d = await resolveSessionLocationDisplay({
      primaryOwnerType: 'project', primaryOwnerId: project.id, primaryWorkspaceId: null, taskId: null,
    })
    expect(d).toMatchObject({ label: 'Web App · Files', kind: 'files', href: '/projects/WEB' })
  })

  it("a general chat works in the person's own files, and says so", async () => {
    const d = await resolveSessionLocationDisplay({
      primaryOwnerType: null, primaryOwnerId: null, primaryWorkspaceId: null, taskId: null,
    })
    expect(d).toMatchObject({ label: 'Personal files', kind: 'files' })
  })
})

describe('a session in a workspace', () => {
  it("links to the workspace's own address in its place, open in the Workspaces tool", async () => {
    const project = await createProject({ name: 'Web App', key: 'WEB' })
    const inProject = await resolveSessionLocationDisplay({
      primaryOwnerType: 'project', primaryOwnerId: project.id, primaryWorkspaceId: 'w1', taskId: null,
    })
    expect(inProject).toMatchObject({ label: 'Web App · website', kind: 'workspace', href: '/projects/WEB?tool=workspaces&workspace=w1' })
    const inChat = await resolveSessionLocationDisplay({
      primaryOwnerType: 'user', primaryOwnerId: 'u1', primaryWorkspaceId: 'w2', taskId: null,
    })
    expect(inChat).toMatchObject({ kind: 'workspace', href: '/chat?tool=workspaces&workspace=w2' })
  })
})

describe('a task session', () => {
  it('shows the task it is working on', async () => {
    const project = await createProject({ name: 'Web App', key: 'WEB' })
    const task = await createTestTask({ data: { title: 'T', projectId: project.id, number: 42, onBehalfOfUserId: 'person-1' } as any })

    const d = await resolveSessionLocationDisplay({
      primaryOwnerType: 'project', primaryOwnerId: project.id, primaryWorkspaceId: null, taskId: task.id,
    })

    expect(d).toMatchObject({ label: 'Web App · Task WEB-42', kind: 'task', href: '/projects/WEB' })
  })
})
