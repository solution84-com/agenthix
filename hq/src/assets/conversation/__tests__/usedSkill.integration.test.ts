/**
 * Integration tests (ADR-0094, real test DB) for a used skill seen in a conversation's work and opened beside it
 * (spec part 5 *Seeing it used*; security review M6): the step's words, opening it at the version the run used with
 * access checked at view time for each kind of skill, a version hq doesn't keep, and erasing a person taking their
 * skills' kept content. The site's run is replaced; its record is the site's word.
 *
 * Only a task's thread is read by people other than its opener, so the cases where someone else looks use one: work in
 * Shop's task thread, whose run used a skill of the organisation's, one in Website rebuild's files and its opener's
 * own. Reading the thread is checked first; the skill's own access is checked after it, so a reader of the thread is
 * still refused a skill of a place they don't see (M6).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RunSkillUse } from '@agenthix/core'
import { prisma } from '../../../test/db'
import { createAgent, createConversation, createProject, createTestTask, createUser, createUserWithRole, joinProjectAs } from '../../../test/factories'

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<object>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
const site = vi.hoisted(() => ({ getRun: vi.fn(), getSession: vi.fn(), listTranscript: vi.fn() }))
vi.mock('../../../sessions/siteRuntimeStore', () => site)

import { storeContent } from '../../content'
import { sealText } from '../../../conversations/sealing'
import { getOperationResult } from '../../../conversations/work/activity'
import { getUsedSkill } from '../usedSkillOperations'
import { personSkillErasure } from '../usedSkillErase'

const ctx = (user: { id: string }) => ({ user })
const md = (name: string, body = '') => Buffer.from(`---\nname: ${name}\ndescription: d\n---\n\n${body}\n`)

let author: { id: string }
let member: { id: string }
let other: { id: string }
let shop: { id: string }
let project: { id: string }
/** The opener's own conversation in Shop, and Shop's task thread, each with one piece of work whose run is run-1. */
let own_: { conversationId: string; operationId: string }
let thread: { conversationId: string; operationId: string }
let installed: RunSkillUse
let inFiles: RunSkillUse
let own: RunSkillUse

function runWith(skillsUsed: unknown[]) {
  site.getRun.mockResolvedValue({ id: 'run-1', sessionId: 's1', startedAt: null, endedAt: null, skillsUsed })
}

async function workIn(conversationId: string, key: string) {
  const op = await prisma.operation.create({
    data: {
      conversationId, kind: 'WORKER', mode: 'BACKGROUND', toolName: 'start_work', idempotencyKey: key, state: 'COMPLETED',
      title: sealText('Review'), boundaryType: 'project', boundaryId: shop.id, authorisedById: author.id, siteId: 'site-1', runId: 'run-1',
    } as never,
  })
  return { conversationId, operationId: op.id }
}

beforeEach(async () => {
  site.getRun.mockReset()
  site.listTranscript.mockReset().mockResolvedValue([])
  await prisma.org.create({ data: { name: 'Fernhill' } })
  author = await createUserWithRole('MEMBER')
  member = await createUserWithRole('MEMBER')
  other = await createUserWithRole('MEMBER')
  shop = await createProject({ name: 'Shop' })
  project = await createProject({ name: 'Website rebuild' })
  for (const p of [shop, project]) {
    await joinProjectAs(p.id, author.id, 'MEMBER')
    await joinProjectAs(p.id, member.id, 'VIEWER')
  }
  const agent = await createAgent({ name: 'Ada' })
  const mine = await createConversation({ home: 'PROJECT', openedById: author.id, projectId: shop.id, agentId: agent.id } as never)
  own_ = await workIn(mine.id, 'k1')
  const task = await createTestTask({ data: { title: 'Review the checkout', projectId: shop.id, number: 1, onBehalfOfUserId: author.id } })
  const taskThread = await createConversation({ home: 'TASK', openedById: author.id, projectId: shop.id, taskId: task.id, agentId: null } as never)
  thread = await workIn(taskThread.id, 'k2')

  const assetDigest = await storeContent([{ path: 'SKILL.md', content: md('Review code', 'Check errors.') }, { path: 'checklist.md', content: Buffer.from('- one') }], prisma)
  const asset = await prisma.asset.create({ data: { kind: 'SKILL', publisher: 'fernhill', name: 'review', givenToAll: true } })
  const v = await prisma.assetVersion.create({ data: { assetId: asset.id, version: '1.3.0', digest: assetDigest, source: 'UPLOAD' } })
  await prisma.asset.update({ where: { id: asset.id }, data: { currentVersionId: v.id } })
  installed = { name: 'org-review', source: 'org', fingerprint: assetDigest, identity: 'fernhill/review', version: '1.3.0' }

  const placeDigest = await storeContent([{ path: 'SKILL.md', content: md('Review a release') }], prisma)
  const placeSkill = await prisma.placeSkill.create({ data: { placeType: 'project', placeId: project.id, path: '.agents/skills/release', group: 'PLACE', lastFingerprint: placeDigest } })
  await prisma.placeSkillVersion.create({ data: { placeSkillId: placeSkill.id, number: 3, digest: placeDigest } })
  inFiles = { name: 'boundary-release', source: 'boundary', fingerprint: placeDigest, placeId: project.id, path: '.agents/skills/release' }

  const ownDigest = await storeContent([{ path: 'SKILL.md', content: md('My notes') }], prisma)
  const ownSkill = await prisma.placeSkill.create({ data: { placeType: 'user', placeId: author.id, path: '.agents/skills/notes', group: 'PLACE', lastFingerprint: ownDigest } })
  await prisma.placeSkillVersion.create({ data: { placeSkillId: ownSkill.id, number: 1, digest: ownDigest } })
  own = { name: 'person-notes', source: 'person', fingerprint: ownDigest, identity: `${author.id}/notes`, version: '1', personId: author.id }
})

const open = (who: { id: string }, name: string, path?: string, where = thread) =>
  getUsedSkill({ ...where, name, ...(path ? { path } : {}) }, ctx(who))

describe('the step names the skill (R4)', () => {
  it("reads with the person-facing name and opens it, for whoever may see it; a refused skill isn't one used", async () => {
    runWith([installed, inFiles, own, { ...installed, name: 'org-gone', refused: 'its content was not in the cache' }])
    site.listTranscript.mockResolvedValue([
      { role: 'TOOL', runId: 'run-1', toolName: 'Skill', toolInput: { skill: 'org-review' }, toolOutput: '', content: '', createdAt: '2026-10-27T10:00:00Z' },
      { role: 'TOOL', runId: 'run-1', toolName: 'Skill', toolInput: { skill: 'person-notes' }, toolOutput: '', content: '', createdAt: '2026-10-27T10:00:01Z' },
      { role: 'TOOL', runId: 'run-1', toolName: 'Skill', toolInput: { skill: 'org-gone' }, toolOutput: '', content: '', createdAt: '2026-10-27T10:00:02Z' },
    ])
    const forAuthor = (await getOperationResult(thread, ctx(author))).work!.steps
    expect(forAuthor).toEqual([
      { text: 'Used the skill Review code · Fernhill · 1.3.0', skill: { name: 'org-review' } },
      { text: 'Used the skill My notes · Yours · Version 1', skill: { name: 'person-notes' } },
      { text: 'Used the skill org-gone' },
    ])
    const forMember = (await getOperationResult(thread, ctx(member))).work!.steps
    expect(forMember[0]).toEqual({ text: 'Used the skill Review code · Fernhill · 1.3.0', skill: { name: 'org-review' } })
    expect(forMember[1]).toEqual({ text: 'Used the skill person-notes' })
  })
})

describe('opening it, access checked at view time (M6)', () => {
  it('an installed skill opens for anyone in the organisation who reads the conversation', async () => {
    runWith([installed])
    const view = await open(member, 'org-review')
    expect(view).toMatchObject({ title: 'Review code', version: '1.3.0', identity: 'fernhill/review', kept: { opened: { path: 'SKILL.md' } } })
    expect((await open(member, 'org-review', 'checklist.md')).kept!.opened.path).toBe('checklist.md')
  })

  it("a place's skill opens only for whoever sees that place, now, though they still read the thread", async () => {
    runWith([inFiles])
    expect(await open(member, 'boundary-release')).toMatchObject({ title: 'Review a release', version: 'Version 3', where: 'Website rebuild' })
    await prisma.projectMember.deleteMany({ where: { projectId: project.id, userId: member.id } })
    await expect(getOperationResult(thread, ctx(member))).resolves.toBeTruthy()
    await expect(open(member, 'boundary-release')).rejects.toMatchObject({ statusCode: 404, message: "That skill isn't there, or isn't yours to see." })
  })

  it("a person's own skill opens for that person only", async () => {
    runWith([own])
    expect(await open(author, 'person-notes')).toMatchObject({ title: 'My notes', level: 'yours' })
    expect(await open(author, 'person-notes', undefined, own_)).toMatchObject({ title: 'My notes', level: 'yours' })
    await expect(open(member, 'person-notes')).rejects.toMatchObject({ statusCode: 404, message: "That skill isn't there, or isn't yours to see." })
  })

  it("a file skill changed and never published isn't kept, and says its fingerprint", async () => {
    const changed = { ...inFiles, fingerprint: 'f'.repeat(64) }
    runWith([changed])
    expect(await open(author, 'boundary-release', undefined, own_)).toMatchObject({ kept: null, fingerprint: changed.fingerprint })
  })

  it("opens nothing for one who can't read the conversation, a refused skill, or work in another conversation", async () => {
    runWith([installed, { ...inFiles, refused: 'changed in files' }])
    await expect(open(other, 'org-review')).rejects.toMatchObject({ statusCode: 404, message: 'Conversation not found' })
    await expect(open(member, 'org-review', undefined, own_)).rejects.toMatchObject({ statusCode: 404, message: 'Conversation not found' })
    await expect(open(author, 'boundary-release')).rejects.toMatchObject({ statusCode: 404 })
    await expect(getUsedSkill({ conversationId: own_.conversationId, operationId: thread.operationId, name: 'org-review' }, ctx(author))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('an outsider to the organisation sees no installed skill', async () => {
    runWith([installed])
    const outsider = await createUser()
    await joinProjectAs(shop.id, outsider.id, 'VIEWER')
    await expect(getOperationResult(thread, ctx(outsider))).resolves.toBeTruthy()
    await expect(open(outsider, 'org-review')).rejects.toMatchObject({ statusCode: 404, message: "That skill isn't there, or isn't yours to see." })
  })
})

describe('erasing a person', () => {
  it("takes their own skills' kept content, leaving the run's identity and fingerprint opening nothing", async () => {
    await prisma.$transaction(await personSkillErasure(prisma, [{ type: 'user', id: author.id }]))
    expect(await prisma.placeSkill.count({ where: { placeType: 'user', placeId: author.id } })).toBe(0)
    expect(await prisma.placeSkillVersion.count({ where: { digest: own.fingerprint } })).toBe(0)
    expect((await prisma.packageContent.findUnique({ where: { digest: own.fingerprint } }))?.releasedAt).toBeInstanceOf(Date)
    expect(await prisma.placeSkill.count({ where: { placeType: 'project', placeId: project.id } })).toBe(1)
    runWith([own])
    expect(await open(author, 'person-notes', undefined, own_)).toMatchObject({ kept: null, identity: own.identity, fingerprint: own.fingerprint })
  })
})
