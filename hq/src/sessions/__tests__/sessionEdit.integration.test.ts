import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createAgent, createSession } from '../../test/factories'
import { ctx } from './sessionActionsHarness'

// updateSession and archiveSession scenarios against the real test
// DB (ADR-0035); split from the former sessionActions.integration.test.ts.
// Side-effecting collaborators are mocked, the session row runs against the
// real database.
//
// Covers SC-071, SC-072, SC-192, SC-193, SC-345.
//
// rename and archive cross the channel to the owning site, which is the shared
// fake. Who may rename or archive a task session is in
// sessionControl.integration.test.ts.
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))

import { updateSession, archiveSession } from '../actions'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

describe('updateSession @SC-071', () => {
  it('renames a session and changes its model for the owner', async () => {
    const user = await createUser()
    const session = await createSession({ userId: user.id })

    const updated = await updateSession(
      { id: session.id, title: 'Renamed', model: 'claude-opus-4-1' },
      ctx(user),
    )

    expect(updated.title).toBe('Renamed')
    expect(updated.model).toBe('claude-opus-4-1')

    const stored = await prisma.agentSession.findUnique({ where: { id: session.id } })
    expect(stored?.title).toBe('Renamed')
    expect(stored?.model).toBe('claude-opus-4-1')
  })
})

describe('updateSession rename round-trip @SC-345', () => {
  it('renames on site BEFORE patching the hq copy, and the hq copy carries the ack-truncated title', async () => {
    const user = await createUser()
    const session = await createSession({ userId: user.id, title: 'Original' })
    siteStore.addSession('site-1', { id: session.id, title: 'Original' })
    let hqTitleAtSiteRename: string | null | undefined
    siteStore.renameSession.mockImplementationOnce(async (siteId, id, title) => {
      hqTitleAtSiteRename = (await prisma.agentSession.findUnique({ where: { id } }))?.title
      const row = await siteStore.getSession(siteId, id)
      if (row) row.title = siteStore.truncateTitle(title)
      return { updated: true }
    })

    const longTitle = 'x'.repeat(600)
    const updated = await updateSession({ id: session.id, title: longTitle }, ctx(user))

    expect(hqTitleAtSiteRename).toBe('Original')
    // The hq copy is patched with the same truncated value the site stored —
    // never left desynced from it.
    expect(updated.title).toBe(longTitle.slice(0, 500))
    expect((await prisma.agentSession.findUnique({ where: { id: session.id } }))?.title).toBe(longTitle.slice(0, 500))
    expect((await siteStore.getSession('site-1', session.id))?.title).toBe(longTitle.slice(0, 500))
  })

  it('a site rename failure surfaces as 503 and leaves the hq copy untouched', async () => {
    const user = await createUser()
    const session = await createSession({ userId: user.id, title: 'Original' })
    siteStore.makeSiteUnreachable('site-1')

    await expect(updateSession({ id: session.id, title: 'New Title' }, ctx(user)))
      .rejects.toMatchObject({ statusCode: 503 })

    const stored = await prisma.agentSession.findUnique({ where: { id: session.id } })
    expect(stored?.title).toBe('Original')
  })
})

describe('updateSession @SC-192', () => {
  it("rejects renaming or model-changing another user's session (404) and changes nothing", async () => {
    const owner = await createUser()
    const intruder = await createUser()
    const session = await createSession({ userId: owner.id, title: 'Original' })

    await expect(
      updateSession({ id: session.id, title: 'Hijacked', model: 'claude-opus-4-1' }, ctx(intruder)),
    ).rejects.toMatchObject({ statusCode: 404 })

    const stored = await prisma.agentSession.findUnique({ where: { id: session.id } })
    expect(stored?.title).toBe('Original')
    expect(stored?.model).toBeNull()
  })
})

describe('updateSession status @SC-071', () => {
  // F-010b: client-supplied status is validated against the SessionStatus enum
  // before being written, instead of being cast through with `as any`.
  it('rejects an out-of-enum status with 400 and changes nothing', async () => {
    const user = await createUser()
    const session = await createSession({ userId: user.id, title: 'Keep' })

    await expect(
      updateSession({ id: session.id, status: 'BOGUS' }, ctx(user)),
    ).rejects.toMatchObject({ statusCode: 400 })

    const stored = await prisma.agentSession.findUnique({ where: { id: session.id } })
    expect(stored?.status).toBe('ACTIVE')
    expect(stored?.title).toBe('Keep')
  })

  it('refuses a valid enum status too: archiving is archiveSession, site first', async () => {
    const user = await createUser()
    const session = await createSession({ userId: user.id })

    await expect(updateSession({ id: session.id, status: 'ARCHIVED' }, ctx(user))).rejects.toMatchObject({ statusCode: 400 })
    expect((await prisma.agentSession.findUnique({ where: { id: session.id } }))?.status).toBe('ACTIVE')
  })
})

describe('archiveSession @SC-072', () => {
  it('archives the owner’s session (status ARCHIVED)', async () => {
    const user = await createUser()
    const session = await createSession({ userId: user.id })

    const archived = await archiveSession({ id: session.id }, ctx(user))

    expect(archived.status).toBe('ARCHIVED')
    const stored = await prisma.agentSession.findUnique({ where: { id: session.id } })
    expect(stored?.status).toBe('ARCHIVED')
  })
})

describe('archiveSession @SC-193', () => {
  it("rejects archiving another user's session (404) and leaves it active", async () => {
    const owner = await createUser()
    const intruder = await createUser()
    const session = await createSession({ userId: owner.id })

    await expect(
      archiveSession({ id: session.id }, ctx(intruder)),
    ).rejects.toMatchObject({ statusCode: 404 })

    const stored = await prisma.agentSession.findUnique({ where: { id: session.id } })
    expect(stored?.status).toBe('ACTIVE')
  })
})
