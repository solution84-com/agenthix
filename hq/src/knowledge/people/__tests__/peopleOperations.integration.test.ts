/**
 * hq's knowledge operations for people against the real test database: membership, the organisation role and the
 * change record are real; the sites holding pages are the knowledge service's fake, since a call to a site leaves hq.
 *
 *  1. **Access per level**, before any site is asked: a project's members read and those who may change its files
 *     change (a Viewer reads only); a person's own, only them; the organisation's, every member reads and only an
 *     organisation admin changes.
 *  2. **Every change is recorded with the person** (G5), and **who made each page and version** is read back from
 *     that record, joined on page and version: the person by their name, an agent with the person it answered.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { versionOf } from '@agenthix/core/file-tools'
import { prisma } from '../../../test/db'
import { createAgent, createProject, createUser, createUserWithRole, joinProjectAs } from '../../../test/factories'

const sites = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('../../siteKnowledge', async () => {
  const { FakeSites } = await import('../../__tests__/fakeKnowledgeDeps')
  const fake = new FakeSites()
  sites.current = fake
  return { siteKnowledge: fake }
})

import { FakeSites } from '../../__tests__/fakeKnowledgeDeps'
import { recordKnowledgeChange } from '../../changeRecord'
import {
  deleteKnowledgePageAction, getKnowledgePageQuery, knowledgePageVersionsQuery, listKnowledgePagesQuery, moveKnowledgePageAction,
  recentlyDeletedKnowledgeQuery, restoreKnowledgeVersionAction, saveKnowledgePageAction, searchKnowledgePagesQuery,
} from '../operations'

const PAGE = '---\ntitle: Release process\ndescription: How we release.\n---\nStaging deploys go out after the checks pass.\n'
const EDITED = PAGE.replace('after the checks pass', 'once Mia approves')
const v = (t: string) => versionOf(Buffer.from(t, 'utf8'))
const fake = () => sites.current as FakeSites

let project: { id: string }
let member: { id: string }
let viewer: { id: string }
let outsider: { id: string }
let admin: { id: string }
const web = () => ({ ownerType: 'project' as const, ownerId: project.id })
const as = (u: { id: string }) => ({ user: { id: u.id } })

beforeEach(async () => {
  fake().store.clear()
  fake().kept.clear()
  fake().calls.length = 0
  project = await createProject({ name: 'Website rebuild', slug: 'website-rebuild', accessLevel: 'PRIVATE' })
  member = await createUserWithRole('MEMBER', { displayName: 'Sam' })
  viewer = await createUserWithRole('MEMBER', { displayName: 'Vic' })
  outsider = await createUserWithRole('MEMBER')
  admin = await createUserWithRole('ADMIN', { displayName: 'Ada' })
  await joinProjectAs(project.id, member.id, 'MEMBER')
  await joinProjectAs(project.id, viewer.id, 'VIEWER')
  fake().put({ ownerType: 'project', ownerId: project.id }, 'processes/release.md', PAGE)
})

describe('access per level @SC-1417', () => {
  it("a project's member reads and may change; a Viewer reads and may not; a non-member is refused before the site", async () => {
    expect(await listKnowledgePagesQuery({ owner: web() }, as(member))).toMatchObject({ canChange: true })
    expect(await listKnowledgePagesQuery({ owner: web() }, as(viewer))).toMatchObject({ canChange: false })
    await expect(saveKnowledgePageAction({ owner: web(), page: 'processes/release.md', content: EDITED, baseVersion: v(PAGE) }, as(viewer)))
      .rejects.toMatchObject({ statusCode: 403 })
    fake().calls.length = 0
    await expect(listKnowledgePagesQuery({ owner: web() }, as(outsider))).rejects.toMatchObject({ statusCode: 403 })
    await expect(getKnowledgePageQuery({ owner: web(), page: 'processes/release.md' }, as(outsider))).rejects.toMatchObject({ statusCode: 403 })
    expect(fake().calls).toEqual([])
  })

  it("a person's own knowledge is theirs alone", async () => {
    const mine = { ownerType: 'user' as const, ownerId: member.id }
    await expect(saveKnowledgePageAction({ owner: mine, page: 'notes.md', content: PAGE, baseVersion: null }, as(member))).resolves.toMatchObject({ outcome: 'done' })
    await expect(listKnowledgePagesQuery({ owner: mine }, as(viewer))).rejects.toMatchObject({ statusCode: 403 })
  })

  it("every member reads the organisation's knowledge; only an organisation admin changes it", async () => {
    const org = { ownerType: 'org' as const }
    expect(await listKnowledgePagesQuery({ owner: org }, as(outsider))).toMatchObject({ canChange: false })
    await expect(saveKnowledgePageAction({ owner: org, page: 'how-we-work/review.md', content: PAGE, baseVersion: null }, as(member)))
      .rejects.toMatchObject({ statusCode: 403 })
    await expect(saveKnowledgePageAction({ owner: org, page: 'how-we-work/review.md', content: PAGE, baseVersion: null }, as(admin)))
      .resolves.toMatchObject({ outcome: 'done', change: 'created' })
  })

  it('refuses a caller who is not signed in, and arguments no screen sends', async () => {
    await expect(listKnowledgePagesQuery({ owner: web() }, {})).rejects.toMatchObject({ statusCode: 401 })
    await expect(listKnowledgePagesQuery({ owner: { ownerType: 'site' } } as never, as(member))).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('the record, and who', () => {
  it('a save is recorded with the person, and the page then names them as who changed it last @SC-1419 @SC-1420', async () => {
    await saveKnowledgePageAction({ owner: web(), page: 'processes/release.md', content: EDITED, baseVersion: v(PAGE) }, as(member))
    const rows = await prisma.knowledgeChange.findMany()
    expect(rows).toEqual([expect.objectContaining({
      placeKind: 'PROJECT', projectId: project.id, page: 'processes/release.md', kind: 'EDITED', version: v(EDITED),
      actorUserId: member.id, agentId: null, conversationId: null,
    })])
    const page = await getKnowledgePageQuery({ owner: web(), page: 'processes/release.md' }, as(viewer))
    expect(page.lastChange).toMatchObject({ by: { kind: 'person', name: 'Sam' }, change: 'edited' })
    const list = await listKnowledgePagesQuery({ owner: web() }, as(viewer))
    expect(list.pages.find(p => p.page === 'processes/release.md')?.lastChange?.by).toEqual({ kind: 'person', name: 'Sam' })
  })

  it("an agent's change names the agent and the person it answered, with its conversation @SC-1419", async () => {
    const kernel = await createAgent({ name: 'Kernel' })
    const owner = { ownerType: 'project' as const, ownerId: project.id }
    fake().put(owner, 'processes/release.md', EDITED)
    await recordKnowledgeChange({ owner, page: 'processes/release.md', kind: 'edited', version: v(EDITED), reach: { userId: member.id, agent: { agentId: kernel.id, conversationId: 'conv-1' } } })
    const page = await getKnowledgePageQuery({ owner: web(), page: 'processes/release.md' }, as(viewer))
    expect(page.lastChange?.by).toEqual({ kind: 'agent', agentName: 'Kernel', forName: 'Sam', conversationId: 'conv-1' })
  })

  it('a conflict answers with the current text and who saved it @SC-1421', async () => {
    await saveKnowledgePageAction({ owner: web(), page: 'processes/release.md', content: EDITED, baseVersion: v(PAGE) }, as(member))
    const answer = await saveKnowledgePageAction({ owner: web(), page: 'processes/release.md', content: PAGE.replace('pass', 'all pass'), baseVersion: v(PAGE) }, as(member))
    expect(answer).toMatchObject({ outcome: 'refused', reason: 'conflict', current: { content: EDITED }, lastChange: { by: { kind: 'person', name: 'Sam' } } })
  })

  it('a move is two records, one under each name @SC-1422', async () => {
    await moveKnowledgePageAction({ owner: web(), from: 'processes/release.md', to: 'how-we-work/release.md', baseVersion: v(PAGE) }, as(member))
    const rows = await prisma.knowledgeChange.findMany({ orderBy: { page: 'asc' } })
    expect(rows.map(r => [r.page, r.kind])).toEqual([
      ['how-we-work/release.md', 'MOVED'],
      ['processes/release.md', 'MOVED'],
    ])
  })

  it('each kept version names who wrote it; Recently deleted names who deleted; restore and permanent deletion are recorded @SC-1419 @SC-1423 @SC-1424 @SC-1425', async () => {
    await saveKnowledgePageAction({ owner: web(), page: 'processes/release.md', content: EDITED, baseVersion: v(PAGE) }, as(member))
    await saveKnowledgePageAction({ owner: web(), page: 'processes/release.md', content: PAGE, baseVersion: v(EDITED) }, as(member))
    const { versions } = await knowledgePageVersionsQuery({ owner: web(), page: 'processes/release.md' }, as(viewer))
    expect(versions.find(x => x.version === v(EDITED))?.by).toEqual({ kind: 'person', name: 'Sam' })

    const kept = '20261025T100000000Z-0000abcd'
    fake().kept.set(kept, { ...fake().kept.get('k1')! })
    await expect(restoreKnowledgeVersionAction({ owner: web(), page: 'processes/release.md', versionId: kept }, as(member))).resolves.toMatchObject({ outcome: 'done' })

    await deleteKnowledgePageAction({ owner: web(), page: 'processes/release.md' }, as(member))
    const { pages } = await recentlyDeletedKnowledgeQuery({ owner: web() }, as(viewer))
    expect(pages).toEqual([expect.objectContaining({ page: 'processes/release.md', by: { kind: 'person', name: 'Sam' } })])

    await deleteKnowledgePageAction({ owner: web(), page: 'processes/release.md', permanently: true }, as(member))
    const kinds = (await prisma.knowledgeChange.findMany({ orderBy: { createdAt: 'asc' } })).map(r => r.kind)
    expect(kinds).toEqual(['EDITED', 'EDITED', 'RESTORED', 'DELETED', 'DELETED'])
  })
})

describe('search @SC-1426', () => {
  it("searches the project and the organisation, each hit marked, and only the levels the person may read", async () => {
    fake().put({ ownerType: 'org', ownerId: 'org' }, 'how-we-work/review.md', '---\ntitle: Review\n---\nRelease reviews need two.\n')
    const answer = await searchKnowledgePagesQuery({ owner: web(), pattern: 'release' }, as(member))
    expect(answer.levels).toEqual([{ level: 'website-rebuild', name: 'Website rebuild' }, { level: 'org', name: 'Organisation' }])
    expect(new Set(answer.hits.map(h => h.level))).toEqual(new Set(['website-rebuild', 'org']))
    await expect(searchKnowledgePagesQuery({ owner: web(), pattern: 'release' }, as(outsider))).rejects.toMatchObject({ statusCode: 403 })
  })
})
