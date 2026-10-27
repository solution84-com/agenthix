/**
 * The `@` picker's files (spec part 3, *Chips in conversations*), against the real test database: the conversation's
 * own place is searched after the person's access to it is checked, each file answered with the reference Mention puts
 * in, and a site that doesn't answer leaves a note — with the site's channel replaced, since it leaves hq.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { LocationFindFilesResult } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createAgent, createConversation, createProject, createUserWithRole, ensureExecutionSite, joinProjectAs } from '../../test/factories'

const channel = vi.hoisted(() => ({ request: vi.fn() }))

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../sites/channel', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../sites/channel')
  return { ...actual, siteChannelRegistry: { ...(actual.siteChannelRegistry as object), request: channel.request } }
})

import { findConversationFilesQuery } from '../findConversationFiles'
import { addConversationPlace } from '../placesOperations'
import { ChannelRequestFailed } from '../../sites/channel/pendingRequests'

const ctx = (user?: { id: string }) => ({ user })
const siteAnswer: LocationFindFilesResult = {
  files: [
    { path: 'reports/q3.pdf', name: 'q3.pdf', folder: 'reports', kind: 'file', size: 10, modifiedAt: '2026-10-01T00:00:00.000Z', match: 'starts' },
    { path: 'q3-notes.md', name: 'q3-notes.md', folder: '', kind: 'file', size: 4, modifiedAt: '2026-09-01T00:00:00.000Z', match: 'starts' },
  ],
  truncated: false,
}

let person: { id: string }
let agent: { id: string }

beforeEach(async () => {
  channel.request.mockReset()
  channel.request.mockResolvedValue(siteAnswer)
  person = await createUserWithRole('MEMBER')
  agent = await createAgent({ name: 'Kernel' })
})

describe("the @ picker's files @SC-1546", () => {
  it("searches a project conversation's place on its site, and answers each file's reference and folder", async () => {
    const site = await ensureExecutionSite()
    const shop = await createProject({ name: 'Shop', slug: 'shop' })
    await joinProjectAs(shop.id, person.id, 'VIEWER')
    const conversation = await createConversation({ openedById: person.id, agentId: agent.id, home: 'PROJECT', projectId: shop.id })

    const result = await findConversationFilesQuery({ conversationId: conversation.id, fragment: '  q3 ' }, ctx(person))

    expect(channel.request).toHaveBeenCalledWith(
      site.siteId, 'location.findFiles',
      { loc: { ownerType: 'project', ownerId: shop.id, workspaceId: null, taskId: null }, fragment: 'q3' },
      expect.any(Number),
    )
    expect(result).toEqual({
      places: [{
        name: 'Shop', state: 'ready', truncated: false,
        files: [
          { reference: 'files/reports/q3.pdf', name: 'q3.pdf', folder: 'files/reports', modifiedAt: '2026-10-01T00:00:00.000Z' },
          { reference: 'files/q3-notes.md', name: 'q3-notes.md', folder: 'files', modifiedAt: '2026-09-01T00:00:00.000Z' },
        ],
      }],
    })
  })

  it("searches the person's own files in their own conversation, and not a place they added", async () => {
    await ensureExecutionSite()
    const shop = await createProject({ name: 'Shop', slug: 'shop' })
    await joinProjectAs(shop.id, person.id, 'MEMBER')
    const conversation = await createConversation({ openedById: person.id, agentId: agent.id })
    await addConversationPlace({ conversationId: conversation.id, place: { kind: 'project', projectId: shop.id } }, ctx(person))

    const result = await findConversationFilesQuery({ conversationId: conversation.id, fragment: '' }, ctx(person))

    expect(result.places.map(p => p.name)).toEqual(['Your space'])
    expect(channel.request).toHaveBeenCalledTimes(1)
    expect(channel.request.mock.calls[0]![2]).toMatchObject({ loc: { ownerType: 'user', ownerId: person.id }, fragment: '' })
  })

  it('leaves a place out with a note when its site does not answer', async () => {
    await ensureExecutionSite()
    const conversation = await createConversation({ openedById: person.id, agentId: agent.id })
    channel.request.mockRejectedValue(new ChannelRequestFailed('no answer', 'timeout'))
    const result = await findConversationFilesQuery({ conversationId: conversation.id, fragment: 'q' }, ctx(person))
    expect(result).toEqual({ places: [{ name: 'Your space', state: 'not-answering', files: [], truncated: false }] })
  })

  it("refuses someone who can't read the conversation, without asking a site", async () => {
    await ensureExecutionSite()
    const conversation = await createConversation({ openedById: person.id, agentId: agent.id })
    const other = await createUserWithRole('MEMBER')
    await expect(findConversationFilesQuery({ conversationId: conversation.id, fragment: 'q' }, ctx(other))).rejects.toBeTruthy()
    expect(channel.request).not.toHaveBeenCalled()
  })

  it('leaves out a project the person is no longer in, without asking its site', async () => {
    await ensureExecutionSite()
    const shop = await createProject({ name: 'Shop', slug: 'shop' })
    await joinProjectAs(shop.id, person.id, 'MEMBER')
    const conversation = await createConversation({ openedById: person.id, agentId: agent.id, home: 'PROJECT', projectId: shop.id })
    await prisma.projectMember.deleteMany({ where: { projectId: shop.id, userId: person.id } })
    const result = await findConversationFilesQuery({ conversationId: conversation.id, fragment: 'q' }, ctx(person)).catch(() => ({ places: [] }))
    expect(result.places).toEqual([])
    expect(channel.request).not.toHaveBeenCalled()
  })

  it('refuses without a session, and a fragment over the cap', async () => {
    const conversation = await createConversation({ openedById: person.id, agentId: agent.id })
    await expect(findConversationFilesQuery({ conversationId: conversation.id, fragment: 'q' }, ctx())).rejects.toMatchObject({ statusCode: 401 })
    await expect(findConversationFilesQuery({ conversationId: conversation.id, fragment: 'a'.repeat(101) }, ctx(person)))
      .rejects.toMatchObject({ statusCode: 400 })
    await expect(findConversationFilesQuery({ conversationId: conversation.id, fragment: 7 as unknown as string }, ctx(person)))
      .rejects.toMatchObject({ statusCode: 400 })
  })
})
