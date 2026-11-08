/**
 * Task templates against the real test database (ADR-0094; spec D16, TM1, TM2): adding one to a project extends it and
 * leaves alone a type or field of the same name, refused when what it adds changed since the person looked; a new type
 * from one of its types; publishing a project's types and fields (maintainers and administrators) or proposing them
 * (anyone else who works in the project); and a maintainer publishing or rejecting the proposal, once.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../../test/db'
import { createProject, createUserWithRole, joinProjectAs } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../server/dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))

import { storeContent } from '../../../assets/content'
import { ensureBuiltInTaskTypes } from '../../../projects/taskTypes'
import { createTaskType } from '../../../projects/taskTypeService'
import { taskTemplateFiles } from '../templateContent'
import { addTypeFromTemplate, installTaskTemplate, taskTemplateInstallPlanView } from '../templateInstall'
import { proposeFromProject, publishFromProject } from '../templatePublish'
import { acceptTaskTemplateProposal, rejectTaskTemplateProposal, viewTaskTemplateProposal } from '../templateReview'
import { libraryRows } from '../../assetList/rows'

const CONTENT = {
  types: [{
    name: 'Content piece', icon: 'task', columns: [
      { name: 'Idea', state: 'BACKLOG' as const, colour: 'neutral' as const, defaultForState: true },
      { name: 'Planned', state: 'TODO' as const, colour: 'neutral' as const, defaultForState: true },
      { name: 'Drafting', state: 'IN_PROGRESS' as const, colour: 'accent' as const, defaultForState: true },
      { name: 'Editing', state: 'IN_PROGRESS' as const, colour: 'warning' as const, defaultForState: false },
      { name: 'Published', state: 'DONE' as const, colour: 'success' as const, defaultForState: true },
    ],
  }],
  fields: [{ name: 'Channel', type: 'SINGLE_SELECT' as const, options: [{ name: 'Blog', colour: 'neutral' as const }, { name: 'Newsletter', colour: 'neutral' as const }] }],
}

async function libraryTemplate() {
  const files = taskTemplateFiles({ publisher: 'fernhill', name: 'content-pipeline', version: '1.1.0', description: 'Pieces of writing.', content: CONTENT })
  const asset = await prisma.asset.create({ data: { kind: 'TASK_TEMPLATE', publisher: 'fernhill', name: 'content-pipeline' } })
  const version = await prisma.assetVersion.create({ data: { assetId: asset.id, version: '1.1.0', digest: await storeContent(files, prisma), source: 'MADE_HERE' } })
  await prisma.asset.update({ where: { id: asset.id }, data: { currentVersionId: version.id } })
  return { assetId: asset.id, versionId: version.id }
}

let projectId: string
beforeEach(async () => {
  await prisma.org.create({ data: { name: 'Fernhill' } })
  projectId = (await createProject({ name: 'Website relaunch' })).id
  await ensureBuiltInTaskTypes(projectId)
})

describe('adding a task template to a project', () => {
  it('adds its types with their columns and its fields, noting the version, and leaves alone a field of the same name', async () => {
    const t = await libraryTemplate()
    await prisma.customField.create({ data: { projectId, name: 'channel', options: { create: [{ name: 'Website', order: 0 }] } } })
    const plan = await taskTemplateInstallPlanView({ assetId: t.assetId, projectId })
    expect(plan.adds.types.map(x => x.name)).toEqual(['Content piece'])
    expect(plan.adds.fields).toEqual([])
    expect(plan.keeps.fields).toEqual([{ name: 'Channel', madeFromThis: null, options: ['Website'] }])

    expect(await installTaskTemplate({ assetId: t.assetId, projectId, versionId: t.versionId, types: ['Content piece'], fields: [] })).toEqual({ types: 1, fields: 0 })
    const made = await prisma.taskType.findFirstOrThrow({ where: { projectId, name: 'Content piece' }, include: { columns: { orderBy: { order: 'asc' } } } })
    expect(made).toMatchObject({ kind: 'CUSTOM', madeFromVersionId: t.versionId })
    expect(made.columns.map(c => [c.name, c.state, c.defaultForState])).toEqual([
      ['Idea', 'BACKLOG', true], ['Planned', 'TODO', true], ['Drafting', 'IN_PROGRESS', true], ['Editing', 'IN_PROGRESS', false], ['Published', 'DONE', true],
    ])
    const kept = await prisma.customField.findFirstOrThrow({ where: { projectId }, include: { options: true } })
    expect(kept.options.map(o => o.name)).toEqual(['Website'])

    const again = await taskTemplateInstallPlanView({ assetId: t.assetId, projectId })
    expect(again.keeps.types).toEqual([{ name: 'Content piece', madeFromThis: '1.1.0' }])
  })

  it('is refused when what it adds changed since the person looked, and when the version moved on', async () => {
    const t = await libraryTemplate()
    await createTaskType({ projectId, name: 'Content piece' })
    await expect(installTaskTemplate({ assetId: t.assetId, projectId, versionId: t.versionId, types: ['Content piece'], fields: ['Channel'] }))
      .rejects.toMatchObject({ statusCode: 409 })
    await expect(installTaskTemplate({ assetId: t.assetId, projectId, versionId: 'older', types: [], fields: ['Channel'] }))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(await prisma.customField.count({ where: { projectId } })).toBe(0)
  })

  it('adds once when two people add it at the same moment', async () => {
    const t = await libraryTemplate()
    const input = { assetId: t.assetId, projectId, versionId: t.versionId, types: ['Content piece'], fields: ['Channel'] }
    const results = await Promise.allSettled([installTaskTemplate(input), installTaskTemplate(input)])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(await prisma.taskType.count({ where: { projectId, name: 'Content piece' } })).toBe(1)
    expect(await prisma.customField.count({ where: { projectId } })).toBe(1)
  })

  it('makes a new type from one of its types, under the name given', async () => {
    const t = await libraryTemplate()
    const made = await addTypeFromTemplate({ projectId, assetId: t.assetId, typeName: 'Content piece', name: 'Article' })
    expect(made).toMatchObject({ name: 'Article', madeFromVersionId: t.versionId })
    expect(made.columns.map(c => c.name)).toEqual(['Idea', 'Planned', 'Drafting', 'Editing', 'Published'])
  })
})

describe("sharing a project's types and fields", () => {
  async function bugType() {
    return createTaskType({ projectId, name: 'Bug', icon: 'bug' })
  }

  it('publishes version 1.0.0 for a Library maintainer, and refuses Task and Epic', async () => {
    const maintainer = await createUserWithRole('MEMBER')
    await prisma.libraryMaintainer.create({ data: { userId: maintainer.id } })
    await joinProjectAs(projectId, maintainer.id)
    const bug = await bugType()
    const out = await publishFromProject(maintainer.id, { projectId, name: 'Launch work', description: '', typeIds: [bug.id], fieldIds: [] })
    expect(out).toMatchObject({ identity: 'fernhill/launch-work', version: '1.0.0' })
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: out.assetId } })
    expect(asset).toMatchObject({ kind: 'TASK_TEMPLATE', publisher: 'fernhill', name: 'launch-work', currentVersionId: out.versionId })
    expect(await prisma.taskType.findUniqueOrThrow({ where: { id: bug.id } })).toMatchObject({ madeFromVersionId: null })

    const { TASK } = await ensureBuiltInTaskTypes(projectId)
    await expect(publishFromProject(maintainer.id, { projectId, name: 'Other', description: '', typeIds: [TASK], fieldIds: [] })).rejects.toMatchObject({ status: 400 })
    await expect(publishFromProject(maintainer.id, { projectId, name: 'Launch work', description: '', typeIds: [bug.id], fieldIds: [] })).rejects.toMatchObject({ status: 409 })
  })

  it('refuses a member who is not a maintainer, who proposes instead; a maintainer publishes the proposal once', async () => {
    const member = await createUserWithRole('MEMBER')
    await joinProjectAs(projectId, member.id)
    const bug = await bugType()
    const input = { projectId, name: 'Launch work', description: 'For a launch.', typeIds: [bug.id], fieldIds: [] }
    await expect(publishFromProject(member.id, input)).rejects.toMatchObject({ status: 403 })

    const { proposalId } = await proposeFromProject(member.id, input)
    await expect(proposeFromProject(member.id, input)).rejects.toMatchObject({ status: 409 })
    const seen = await viewTaskTemplateProposal(member.id, proposalId)
    expect(seen).toMatchObject({ state: 'OPEN', mayReview: false, identity: 'fernhill/launch-work' })
    expect(seen.holds.types.map(t => t.name)).toEqual(['Bug'])

    const admin = await createUserWithRole('ADMIN')
    await expect(acceptTaskTemplateProposal(member.id, { proposalId, digest: seen.digest })).rejects.toMatchObject({ status: 403 })
    const results = await Promise.allSettled([
      acceptTaskTemplateProposal(admin.id, { proposalId, digest: seen.digest }),
      acceptTaskTemplateProposal(admin.id, { proposalId, digest: seen.digest }),
    ])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(await prisma.asset.count({ where: { kind: 'TASK_TEMPLATE', name: 'launch-work' } })).toBe(1)
    expect(await prisma.proposal.findUniqueOrThrow({ where: { id: proposalId } })).toMatchObject({ state: 'ACCEPTED', reviewedById: admin.id })
  })

  it('rejects a proposal only with a note, and lets a skill proposal of the same name wait beside it', async () => {
    const member = await createUserWithRole('MEMBER')
    await joinProjectAs(projectId, member.id)
    const bug = await bugType()
    const { proposalId } = await proposeFromProject(member.id, { projectId, name: 'Launch work', description: '', typeIds: [bug.id], fieldIds: [] })
    const skill = await prisma.proposal.create({
      data: { kind: 'SKILL', aim: 'ORGANISATION', name: 'launch-work', description: 'a skill', digest: (await prisma.proposal.findUniqueOrThrow({ where: { id: proposalId } })).digest },
    })
    expect(skill.state).toBe('OPEN')
    const admin = await createUserWithRole('ADMIN')
    const { digest } = await viewTaskTemplateProposal(admin.id, proposalId)
    await expect(rejectTaskTemplateProposal(admin.id, { proposalId, digest, note: ' ' })).rejects.toMatchObject({ status: 400 })
    expect(await rejectTaskTemplateProposal(admin.id, { proposalId, digest, note: 'Use Issues instead.' })).toEqual({ state: 'REJECTED' })
    await expect(viewTaskTemplateProposal(admin.id, skill.id)).rejects.toMatchObject({ status: 404 })
  })

  it('refuses a Viewer of the project', async () => {
    const viewer = await createUserWithRole('MEMBER')
    await joinProjectAs(projectId, viewer.id, 'VIEWER')
    const bug = await bugType()
    await expect(proposeFromProject(viewer.id, { projectId, name: 'Launch work', description: '', typeIds: [bug.id], fieldIds: [] })).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe("the Library's list", () => {
  it('lists a task template with the projects made from it, and a proposed one waiting for review', async () => {
    const t = await libraryTemplate()
    await installTaskTemplate({ assetId: t.assetId, projectId, versionId: t.versionId, types: ['Content piece'], fields: ['Channel'] })
    const member = await createUserWithRole('MEMBER')
    await joinProjectAs(projectId, member.id)
    const bug = await createTaskType({ projectId, name: 'Bug' })
    await proposeFromProject(member.id, { projectId, name: 'Launch work', description: 'For a launch.', typeIds: [bug.id], fieldIds: [] })
    const admin = await createUserWithRole('ADMIN')
    const rows = await libraryRows(prisma, { kind: 'person', userId: admin.id, role: 'ADMIN', libraryMaintainer: false, projectRole: null })
    expect(rows.find(r => r.assetId === t.assetId)).toMatchObject({ kind: 'task-template', madeCount: 1, description: 'Pieces of writing.' })
    expect(rows.find(r => r.proposalId)).toMatchObject({ kind: 'task-template', title: 'Launch work', statuses: ['waiting'] })
  })
})
