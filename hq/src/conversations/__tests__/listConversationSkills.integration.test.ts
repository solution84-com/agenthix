/**
 * The `/` picker's list (skills spec part 5, *Picking a skill*), against the real test database: the skills the
 * conversation's agent would have staged, with their staged names, titles, descriptions and sources; those a run would
 * not stage left out; only the conversation's own person may ask; and nothing asked of any site.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'

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

import { storeContent } from '../../assets/content'
import { listConversationSkillsQuery, listStartSkillsQuery } from '../listConversationSkills'
import { createAgent, createConversation, createProject, createSession, createUserWithRole, joinProjectAs } from '../../test/factories'

const F = 'f'.repeat(64)
const ctx = (user?: { id: string }) => ({ user })
const skillMd = (name: string, extra = '') => Buffer.from(`---\nname: ${name}\ndescription: ${name} does its work.\n${extra}---\n\nBody`)
const content = (name: string, extra = '') => storeContent([{ path: 'SKILL.md', content: skillMd(name, extra) }], prisma)

async function installed(name: string, data: { givenToAll?: boolean; grantTo?: string; extra?: string } = {}) {
  const asset = await prisma.asset.create({ data: { kind: 'SKILL', publisher: 'acme', name, givenToAll: data.givenToAll ?? false } })
  const digest = await content(name, data.extra)
  const version = await prisma.assetVersion.create({ data: { assetId: asset.id, version: '1.3.0', digest, source: 'UPLOAD' } })
  await prisma.asset.update({ where: { id: asset.id }, data: { currentVersionId: version.id } })
  if (data.grantTo) await prisma.assetGrant.create({ data: { assetId: asset.id, agentId: data.grantTo } })
  return asset
}

let person: { id: string }
let agent: { id: string }

beforeEach(async () => {
  channel.request.mockReset()
  await prisma.org.create({ data: { name: 'Fernhill' } })
  person = await createUserWithRole('MEMBER')
  agent = await createAgent({ name: 'Ada' })
})

describe('the / picker\'s skills @SC-1547', () => {
  it('lists this agent\'s installed skills by staged name, with title, description and source, and no other agent\'s', async () => {
    await installed('code-review', { givenToAll: true })
    await installed('mine', { grantTo: agent.id })
    const other = await createAgent({ name: 'Other' })
    await installed('theirs', { grantTo: other.id })
    const conversation = await createConversation({ openedById: person.id, agentId: agent.id })

    const { skills } = await listConversationSkillsQuery({ conversationId: conversation.id }, ctx(person))
    expect(skills).toEqual([
      { name: 'org-code-review', title: 'code-review', description: 'code-review does its work.', source: 'every-agent', sourceName: 'Fernhill', detail: 'acme/code-review 1.3.0' },
      { name: 'agent-mine', title: 'mine', description: 'mine does its work.', source: 'this-agent', sourceName: 'This agent', detail: 'acme/mine 1.3.0' },
    ])
    expect(channel.request).not.toHaveBeenCalled()
  })

  it('leaves out a skill whose header sets user-invocable to false', async () => {
    await installed('visible', { givenToAll: true })
    await installed('model-only', { givenToAll: true, extra: 'user-invocable: false\n' })
    const conversation = await createConversation({ openedById: person.id, agentId: agent.id })
    const { skills } = await listConversationSkillsQuery({ conversationId: conversation.id }, ctx(person))
    expect(skills.map(s => s.name)).toEqual(['org-visible'])
  })

  it('lists the project\'s switched-on skills in files from the last scan, by their scanned names, and not an off, gone or other agent\'s one', async () => {
    const project = await createProject({ name: 'Website rebuild' })
    await joinProjectAs(project.id, person.id, 'MEMBER')
    const place = { placeType: 'project' as const, placeId: project.id }
    const on = { ...place, group: 'PLACE' as const, lastFingerprint: F, switch: 'ON' as const, switchFingerprint: F }
    await prisma.placeSkill.create({ data: { ...on, path: '.agents/skills/release' } })
    // Never published: shown by what the last scan read of its front matter.
    await prisma.placeSkill.create({ data: { ...on, path: '.agents/skills/deploy', name: 'Deploy the site', description: 'Ship it.\nThen check it.' } })
    await prisma.placeSkill.create({ data: { ...place, group: 'PLACE', lastFingerprint: F, path: '.agents/skills/off' } })
    await prisma.placeSkill.create({ data: { ...on, path: '.agents/skills/gone', goneAt: new Date() } })
    const other = await createAgent({ name: 'Other' })
    await prisma.placeSkill.create({ data: { ...on, group: 'AGENT', agentId: other.id, path: `.agents/agents/${other.id}/skills/theirs` } })
    const conversation = await createConversation({ openedById: person.id, agentId: agent.id, home: 'PROJECT', projectId: project.id })

    const { skills } = await listConversationSkillsQuery({ conversationId: conversation.id }, ctx(person))
    expect(skills).toEqual([
      { name: 'shared-deploy', title: 'Deploy the site', description: 'Ship it.', source: 'place', sourceName: 'Website rebuild', detail: '.agents/skills/deploy' },
      { name: 'shared-release', title: 'release', description: '', source: 'place', sourceName: 'Website rebuild', detail: '.agents/skills/release' },
    ])
    expect(channel.request).not.toHaveBeenCalled()
  })

  it('lists the person\'s own published, switched-on skills as Yours', async () => {
    const row = await prisma.placeSkill.create({
      data: { placeType: 'user', placeId: person.id, path: '.agents/skills/notes', group: 'PLACE', lastFingerprint: F },
    })
    const digest = await content('notes')
    await prisma.placeSkillVersion.create({ data: { placeSkillId: row.id, number: 1, digest } })
    await prisma.placeSkill.update({ where: { id: row.id }, data: { switch: 'ON', switchFingerprint: digest } })
    const project = await createProject({ name: 'Website rebuild' })
    await joinProjectAs(project.id, person.id, 'MEMBER')
    const conversation = await createConversation({ openedById: person.id, agentId: agent.id, home: 'PROJECT', projectId: project.id })

    const { skills } = await listConversationSkillsQuery({ conversationId: conversation.id }, ctx(person))
    expect(skills).toEqual([
      { name: 'person-notes', title: 'notes', description: 'notes does its work.', source: 'yours', sourceName: 'Yours', detail: `${person.id}/notes 1` },
    ])
  })

  it('sets aside the project\'s copy of an installed skill, listing the installed one once', async () => {
    await installed('code-review', { givenToAll: true })
    const project = await createProject({ name: 'Website rebuild' })
    await joinProjectAs(project.id, person.id, 'MEMBER')
    const digest = await content('code-review', 'metadata:\n  identity: acme/code-review\n')
    const row = await prisma.placeSkill.create({
      data: { placeType: 'project', placeId: project.id, group: 'PLACE', path: '.agents/skills/code-review', lastFingerprint: digest, switch: 'ON', switchFingerprint: digest },
    })
    await prisma.placeSkillVersion.create({ data: { placeSkillId: row.id, number: 1, digest } })
    const conversation = await createConversation({ openedById: person.id, agentId: agent.id, home: 'PROJECT', projectId: project.id })

    const { skills } = await listConversationSkillsQuery({ conversationId: conversation.id }, ctx(person))
    expect(skills.map(s => s.source)).toEqual(['every-agent'])
  })

  it('is refused to anyone but the conversation\'s own person, and writes nothing', async () => {
    await installed('code-review', { givenToAll: true })
    const conversation = await createConversation({ openedById: person.id, agentId: agent.id })
    const stranger = await createUserWithRole('MEMBER')
    await expect(listConversationSkillsQuery({ conversationId: conversation.id }, ctx(stranger))).rejects.toMatchObject({ statusCode: 404 })
    await expect(listConversationSkillsQuery({ conversationId: conversation.id }, ctx())).rejects.toMatchObject({ statusCode: 401 })
    await expect(listConversationSkillsQuery({ conversationId: '' }, ctx(person))).rejects.toMatchObject({ statusCode: 400 })
    expect(await prisma.placeSkill.count()).toBe(0)
  })
})

describe('the / picker in the box that starts a conversation @SC-1548', () => {
  it("lists the chosen agent's skills in the project it will start in, and only for an agent the person may talk to there", async () => {
    await installed('code-review', { givenToAll: true })
    const project = await createProject({ name: 'Website rebuild' })
    await joinProjectAs(project.id, person.id, 'MEMBER')
    await prisma.projectAgent.create({ data: { projectId: project.id, agentId: agent.id } })
    const start = { home: 'PROJECT' as const, projectId: project.id, agentId: agent.id }

    const { skills } = await listStartSkillsQuery(start, ctx(person))
    expect(skills.map(s => s.name)).toEqual(['org-code-review'])
    expect(channel.request).not.toHaveBeenCalled()

    const outside = await createAgent({ name: 'Outside' })
    await expect(listStartSkillsQuery({ ...start, agentId: outside.id }, ctx(person))).rejects.toMatchObject({ statusCode: 404 })
    const stranger = await createUserWithRole('MEMBER')
    await expect(listStartSkillsQuery(start, ctx(stranger))).rejects.toMatchObject({ statusCode: 404 })
    await expect(listStartSkillsQuery(start, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('the built-in given only in a repository, in the picker', () => {
  it("is offered once the conversation's work has run in a workspace, from hq's records alone", async () => {
    const asset = await prisma.asset.create({ data: { kind: 'SKILL', publisher: 'agenthix', name: 'working-with-git', builtIn: true } })
    const version = await prisma.assetVersion.create({ data: { assetId: asset.id, version: '1.0.0', digest: await content('working-with-git'), source: 'UPLOAD' } })
    await prisma.asset.update({ where: { id: asset.id }, data: { currentVersionId: version.id } })
    const conversation = await createConversation({ openedById: person.id, agentId: agent.id })

    expect((await listConversationSkillsQuery({ conversationId: conversation.id }, ctx(person))).skills.map(s => s.name)).toEqual([])
    await createSession({ userId: person.id, agentId: agent.id, conversationId: conversation.id, primaryWorkspaceId: 'w1' })
    expect((await listConversationSkillsQuery({ conversationId: conversation.id }, ctx(person))).skills.map(s => s.name)).toEqual(['platform-working-with-git'])
    expect(channel.request).not.toHaveBeenCalled()
  })
})
