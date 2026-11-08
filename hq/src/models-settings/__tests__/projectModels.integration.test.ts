/**
 * A project's own model list against the real test database (Settings › Models): the first switch to Only these is
 * pre-filled with the models the project's agents use now, a list emptied afterwards stays empty, only a project admin
 * changes it, and anyone in the project reads what is allowed as one line.
 */
import { describe, expect, it, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createUser, joinProjectAs } from '../../test/factories'
import { createProvider, setOrgDefaults } from '../../routing/__tests__/routingFixtures'

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { setModelList } from '../settingsActions'
import { getProjectModelsLine } from '../settingsReads'

const SONNET = 'claude-sonnet-4-5'
const IN_USE = `anthropic/${SONNET}`

const status = async (p: Promise<unknown>) => ((await p.then(() => null, e => e)) as { statusCode?: number } | null)?.statusCode ?? null

async function setup(accessLevel: 'OPEN' | 'PRIVATE' = 'OPEN') {
  const anthropic = await createProvider({ vendor: 'anthropic', name: 'Anthropic' })
  await setOrgDefaults({ conversation: { providerId: anthropic.id, model: SONNET } })
  const admin = await createUser()
  const member = await createUser()
  const project = await createProject({ accessLevel })
  await joinProjectAs(project.id, admin.id, 'ADMIN')
  await joinProjectAs(project.id, member.id, 'MEMBER')
  const agent = await createAgent()
  await prisma.projectAgent.create({ data: { projectId: project.id, agentId: agent.id } })
  const ref = { owner: 'project', ownerId: project.id }
  const entriesOf = async () => (await prisma.modelList.findUnique({
    where: { owner_ownerId: { owner: 'project', ownerId: project.id } },
    select: { mode: true, entries: { select: { effect: true, pattern: true } } },
  }))
  return { admin, member, project, ref, entriesOf }
}

describe('switching a project to Only these', () => {
  it("pre-fills a list with nothing allowed with the models the project's agents use now", async () => {
    const { admin, ref, entriesOf } = await setup()
    await setModelList({ ...ref, mode: 'only_these', entries: [] }, { user: { id: admin.id } })
    const saved = await entriesOf()
    expect(saved?.mode).toBe('only_these')
    expect(saved?.entries).toEqual([{ effect: 'allow', pattern: IN_USE }])
  })

  it('keeps the entries it is sent when they allow a model', async () => {
    const { admin, ref, entriesOf } = await setup()
    await setModelList({ ...ref, mode: 'only_these', entries: [{ effect: 'allow', pattern: 'openai/gpt-5' }] }, { user: { id: admin.id } })
    expect((await entriesOf())?.entries).toEqual([{ effect: 'allow', pattern: 'openai/gpt-5' }])
  })

  it('leaves an Only these list that was emptied empty', async () => {
    const { admin, ref, entriesOf } = await setup()
    await setModelList({ ...ref, mode: 'only_these', entries: [] }, { user: { id: admin.id } })
    await setModelList({ ...ref, mode: 'only_these', entries: [] }, { user: { id: admin.id } })
    const saved = await entriesOf()
    expect(saved?.mode).toBe('only_these')
    expect(saved?.entries).toEqual([])
  })

  it('refuses anyone who is not a project admin, and changes nothing', async () => {
    const { member, ref, entriesOf } = await setup()
    const outsider = await createUser()
    expect(await status(setModelList({ ...ref, mode: 'only_these', entries: [] }, { user: { id: member.id } }))).toBe(403)
    expect(await status(setModelList({ ...ref, mode: 'only_these', entries: [] }, { user: { id: outsider.id } }))).toBe(403)
    expect(await status(setModelList({ ...ref, mode: 'only_these', entries: [] }, {}))).toBe(401)
    expect(await entriesOf()).toBeNull()
  })
})

describe('getProjectModelsLine', () => {
  it('tells a member what is allowed, before and after the list is set', async () => {
    const { admin, member, project, ref } = await setup()
    expect(await getProjectModelsLine({ projectId: project.id }, { user: { id: member.id } })).toBe('Any model Fernhill allows')
    await setModelList({ ...ref, mode: 'only_these', entries: [] }, { user: { id: admin.id } })
    expect(await getProjectModelsLine({ projectId: project.id }, { user: { id: member.id } })).toMatch(/^Only .+/)
  })

  it('refuses someone who is not signed in, and someone not in a private project', async () => {
    const { project, member } = await setup('PRIVATE')
    const outsider = await createUser()
    expect(await status(getProjectModelsLine({ projectId: project.id }, {}))).toBe(401)
    expect(await status(getProjectModelsLine({ projectId: project.id }, { user: { id: outsider.id } }))).toBe(404)
    await expect(getProjectModelsLine({ projectId: project.id }, { user: { id: member.id } })).resolves.toBe('Any model Fernhill allows')
  })
})
