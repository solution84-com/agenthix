/**
 * What chips show (spec part 3, *Chips in conversations*; T11), against the real test database: access is checked as
 * the open checks it, and nothing is signed or recorded — with the site's channel replaced, since it leaves hq.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LocationFileError, type FileAboutResult } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createProject, createUser, ensureExecutionSite, joinProjectAs } from '../../test/factories'

const channel = vi.hoisted(() => ({ request: vi.fn() }))
const signing = vi.hoisted(() => ({ getSigningKey: vi.fn(async () => { throw new Error('a chip signs nothing') }) }))

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/identity/signingKeyService', () => ({ SIGNING_ALG: 'RS256', getSigningKey: signing.getSigningKey }))
vi.mock('../../sites/channel', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../sites/channel')
  return { ...actual, siteChannelRegistry: { ...(actual.siteChannelRegistry as object), request: channel.request, get: () => null } }
})

import { getFileFactsQuery } from '../operations'
import { ChannelRequestFailed } from '../../sites/channel/pendingRequests'

const answer = (name: string): FileAboutResult =>
  ({ ok: true, name, size: 120, modifiedAt: '2026-10-26T10:00:00.000Z', version: '120:1793008800000', contentType: 'text/plain', looksLikeText: true })
const ctx = (user?: { id: string }) => ({ user })
const placeFile = (projectId: string, path = 'docs/plan.md') =>
  ({ space: 'place' as const, loc: { ownerType: 'project' as const, ownerId: projectId, workspaceId: null, taskId: null }, path })

beforeEach(() => {
  channel.request.mockReset()
  channel.request.mockImplementation(async (_site: string, _method: string, ref: { path: string }) => answer(ref.path.split('/').pop()!))
  signing.getSigningKey.mockClear()
})

async function member(role: 'MEMBER' | 'VIEWER' = 'MEMBER') {
  const project = await createProject()
  const me = await createUser()
  await joinProjectAs(project.id, me.id, role)
  return { project, me }
}

describe("a chip's facts @SC-1515", () => {
  it('answers the facts for a member, asking the site and signing and recording nothing', async () => {
    const site = await ensureExecutionSite()
    const { project, me } = await member('VIEWER')
    const result = await getFileFactsQuery({ files: [placeFile(project.id), placeFile(project.id, 'src/main.py')] }, ctx(me))
    expect(result.answers).toEqual([
      { state: 'ready', facts: { name: 'plan.md', size: 120, version: '120:1793008800000', contentType: 'text/markdown', kind: 'markdown' } },
      { state: 'ready', facts: expect.objectContaining({ name: 'main.py', kind: 'code', language: 'python' }) },
    ])
    expect(channel.request).toHaveBeenCalledWith(site.siteId, 'file.about', placeFile(project.id), expect.any(Number))
    expect(signing.getSigningKey).not.toHaveBeenCalled()
    expect(await prisma.fileOpened.count()).toBe(0)
  })

  it('answers facts even with no relay: a chip needs none', async () => {
    await ensureExecutionSite()
    const { project, me } = await member()
    expect(await prisma.relay.count()).toBe(0)
    expect((await getFileFactsQuery({ files: [placeFile(project.id)] }, ctx(me))).answers[0].state).toBe('ready')
  })

  it('answers not-found to someone outside the project, without asking the site', async () => {
    await ensureExecutionSite()
    const { project } = await member()
    const outsider = await createUser()
    expect(await getFileFactsQuery({ files: [placeFile(project.id)] }, ctx(outsider))).toEqual({ answers: [{ state: 'not-found' }] })
    expect(channel.request).not.toHaveBeenCalled()
  })

  it("answers not-found for another person's own files, and the facts for theirs", async () => {
    await ensureExecutionSite()
    const owner = await createUser()
    const file = { space: 'place' as const, loc: { ownerType: 'user' as const, ownerId: owner.id, workspaceId: null, taskId: null }, path: 'a.txt' }
    expect((await getFileFactsQuery({ files: [file] }, ctx(await createUser()))).answers).toEqual([{ state: 'not-found' }])
    expect((await getFileFactsQuery({ files: [file] }, ctx(owner))).answers[0].state).toBe('ready')
  })

  it('answers gone when the site says the file is not there', async () => {
    await ensureExecutionSite()
    const { project, me } = await member()
    channel.request.mockResolvedValueOnce({ ok: false, refusal: 'not-found' })
    channel.request.mockRejectedValueOnce(new ChannelRequestFailed(new LocationFileError('not_found', 'x').message, 'failed'))
    const result = await getFileFactsQuery({ files: [placeFile(project.id, 'old.md')] }, ctx(me))
    expect(result.answers).toEqual([{ state: 'gone' }])
    expect((await getFileFactsQuery({ files: [placeFile(project.id, 'moved.md')] }, ctx(me))).answers).toEqual([{ state: 'gone' }])
  })

  it('answers site-unavailable when the site does not answer', async () => {
    await ensureExecutionSite()
    const { project, me } = await member()
    channel.request.mockRejectedValue(new ChannelRequestFailed('no answer', 'offline'))
    const result = await getFileFactsQuery({ files: [placeFile(project.id, 'a.md'), placeFile(project.id, 'b.md')] }, ctx(me))
    expect(result.answers).toEqual([{ state: 'site-unavailable' }, { state: 'site-unavailable' }])
  })

  it('refuses without a session, and a request that names no site\'s file', async () => {
    const me = await createUser()
    await expect(getFileFactsQuery({ files: [placeFile('p1')] }, ctx())).rejects.toMatchObject({ statusCode: 401 })
    await expect(getFileFactsQuery({ files: [placeFile('p1', '../../etc/passwd')] }, ctx(me))).rejects.toMatchObject({ statusCode: 400 })
    await expect(getFileFactsQuery({ files: [] }, ctx(me))).rejects.toMatchObject({ statusCode: 400 })
  })
})
