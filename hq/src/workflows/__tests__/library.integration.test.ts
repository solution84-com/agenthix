/**
 * The library against the real test database: storing proposals as versions, who approves in a project and in a
 * person's own storage, approvals per workflow, place and hash, superseding, the switch and turning off, and image
 * upgrades. The site is a stand-in: these never reach one.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createUserWithRole, createProject, joinProjectAs } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import type { WorkflowReadFilesResult } from '@agenthix/core'
import { readProposal } from '../proposalContent'
import { storeVersion } from '../propose'
import { approveWorkflowVersion, declineWorkflowVersion } from '../approve'
import { setWorkflowEnabled, turnOffWorkflows } from '../switch'
import { placeStanding, type WorkflowPlace } from '../placeAccess'
import { upgradeApprovedVersion } from '../imageUpgrade'
import { listPlaceWorkflows, toListEntry } from '../library'

const DIGEST = `sha256:${'1'.repeat(64)}`
const agentProposer = { kind: 'agent' as const, agentId: 'agent-1', agentRunId: 'run-1', onBehalfOfUserId: 'user-1' }

async function propose(place: WorkflowPlace, definition: Record<string, unknown>, digest = DIGEST) {
  const sites = {
    async readFiles(): Promise<WorkflowReadFilesResult> {
      return { ok: true, files: [{ path: 'workflow.yaml', contentBase64: Buffer.from(JSON.stringify(definition)).toString('base64'), executable: false }] }
    },
  }
  const read = await readProposal('site', { ownerType: place.type, ownerId: place.id, workspaceId: null }, 'workflow.yaml', {
    sites, readYaml: (t) => ({ ok: true, data: JSON.parse(t) }),
    secretNames: async () => ['KEY'], variableNames: async () => [], executorImageDigest: digest,
  })
  if (!read.ok) throw new Error(read.message)
  const result = await storeVersion(place, read.proposal, agentProposer, () => {})
  // The plain checks (lane 3c) write their flags at proposal; these tests stand in for them.
  await prisma.workflowVersion.updateMany({ where: { hash: result.hash }, data: { checkFlags: [], cardMayApprove: true } })
  const workflow = await prisma.workflow.findFirstOrThrow({ where: { placeType: place.type, placeId: place.id, name: result.workflow } })
  return { ...result, workflowId: workflow.id }
}

const deploy = (run = 'true') => ({ name: 'deploy', steps: [{ name: 'Go', run, secrets: ['KEY'] }] })

async function projectWithAdmin() {
  const project = await createProject()
  const admin = await createUser()
  await joinProjectAs(project.id, admin.id, 'ADMIN')
  return { place: { type: 'project' as const, id: project.id }, admin, project }
}

describe('who may do what in a place', () => {
  it('a project\'s admins administer, members work, viewers read, others nothing; an org admin gets nothing from that', async () => {
    const { place, admin, project } = await projectWithAdmin()
    const member = await createUser()
    const viewer = await createUser()
    const orgAdmin = await createUserWithRole('ADMIN')
    await joinProjectAs(project.id, member.id, 'MEMBER')
    await joinProjectAs(project.id, viewer.id, 'VIEWER')
    expect(await placeStanding(place, admin.id)).toBe('administers')
    expect(await placeStanding(place, member.id)).toBe('works')
    expect(await placeStanding(place, viewer.id)).toBe('reads')
    expect(await placeStanding(place, orgAdmin.id)).toBe('none')
  })

  it('a person administers their own storage, and nobody else does', async () => {
    const person = await createUser()
    const other = await createUserWithRole('ADMIN')
    expect(await placeStanding({ type: 'user', id: person.id }, person.id)).toBe('administers')
    expect(await placeStanding({ type: 'user', id: person.id }, other.id)).toBe('none')
  })
})

describe('proposals', () => {
  it('stores the next version with its proposer, and answers the same waiting version for the same content', async () => {
    const { place } = await projectWithAdmin()
    const first = await propose(place, deploy())
    const again = await propose(place, deploy())
    const second = await propose(place, deploy('false'))
    expect([first.version, again.version, second.version]).toEqual([1, 1, 2])
    const row = await prisma.workflowVersion.findFirstOrThrow({ where: { hash: first.hash } })
    expect(row).toMatchObject({ state: 'PROPOSED', proposedByAgentId: 'agent-1', proposedByRunId: 'run-1', proposedForUserId: 'user-1' })
  })
})

describe('approving', () => {
  it('records (workflow, place, hash, who, when) and turns the workflow on with its first approval', async () => {
    const { place, admin } = await projectWithAdmin()
    const v1 = await propose(place, deploy())
    await expect(approveWorkflowVersion({ workflowId: v1.workflowId, hash: v1.hash, via: 'review' }, { kind: 'person', userId: admin.id }))
      .resolves.toEqual({ number: 1, enabled: true })
    const approval = await prisma.workflowApproval.findFirstOrThrow({ where: { workflowId: v1.workflowId } })
    expect(approval).toMatchObject({ placeType: 'project', placeId: place.id, hash: v1.hash, approvedById: admin.id, automatic: false })
  })

  it('refuses a member who isn\'t an admin', async () => {
    const { place, project } = await projectWithAdmin()
    const member = await createUser()
    await joinProjectAs(project.id, member.id, 'MEMBER')
    const v1 = await propose(place, deploy())
    await expect(approveWorkflowVersion({ workflowId: v1.workflowId, hash: v1.hash, via: 'review' }, { kind: 'person', userId: member.id }))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('approves per place: the same content in another project waits for that project', async () => {
    const a = await projectWithAdmin()
    const b = await projectWithAdmin()
    const va = await propose(a.place, deploy())
    const vb = await propose(b.place, deploy())
    expect(va.hash).toBe(vb.hash)
    await approveWorkflowVersion({ workflowId: va.workflowId, hash: va.hash, via: 'review' }, { kind: 'person', userId: a.admin.id })
    expect((await prisma.workflowVersion.findFirstOrThrow({ where: { workflowId: vb.workflowId } })).state).toBe('PROPOSED')
    await expect(approveWorkflowVersion({ workflowId: vb.workflowId, hash: vb.hash, via: 'review' }, { kind: 'person', userId: a.admin.id }))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('a newer approval supersedes the old; a waiting version never stops the approved one', async () => {
    const { place, admin } = await projectWithAdmin()
    const by = { kind: 'person' as const, userId: admin.id }
    const v1 = await propose(place, deploy())
    await approveWorkflowVersion({ workflowId: v1.workflowId, hash: v1.hash, via: 'review' }, by)
    const v2 = await propose(place, deploy('echo 2'))
    expect(toListEntry((await listPlaceWorkflows(place))[0])).toMatchObject({ approvedVersion: 1, waitingVersion: 2, enabled: true, secrets: ['KEY'] })
    await approveWorkflowVersion({ workflowId: v2.workflowId, hash: v2.hash, via: 'review' }, by)
    const states = await prisma.workflowVersion.findMany({ where: { workflowId: v1.workflowId }, orderBy: { number: 'asc' }, select: { state: true } })
    expect(states.map((s) => s.state)).toEqual(['SUPERSEDED', 'APPROVED'])
  })

  it('declines by hash, and a declined version can\'t then be approved', async () => {
    const { place, admin } = await projectWithAdmin()
    const by = { kind: 'person' as const, userId: admin.id }
    const v1 = await propose(place, deploy())
    await declineWorkflowVersion({ workflowId: v1.workflowId, hash: v1.hash }, by)
    await expect(approveWorkflowVersion({ workflowId: v1.workflowId, hash: v1.hash, via: 'review' }, by)).rejects.toMatchObject({ statusCode: 409 })
    expect((await prisma.workflowVersion.findFirstOrThrow({ where: { hash: v1.hash, workflowId: v1.workflowId } })).declinedById).toBe(admin.id)
  })

  it('in own storage, wider GitHub permissions need an organisation administrator', async () => {
    const person = await createUserWithRole('MEMBER')
    const place = { type: 'user' as const, id: person.id }
    const wide = await propose(place, { name: 'gh', steps: [{ name: 'S', run: 'true', secrets: ['GITHUB_TOKEN'] }], github: { workflows: 'write' } })
    await expect(approveWorkflowVersion({ workflowId: wide.workflowId, hash: wide.hash, via: 'review' }, { kind: 'person', userId: person.id }))
      .rejects.toMatchObject({ statusCode: 403 })
    const narrow = await propose(place, { name: 'gh2', steps: [{ name: 'S', run: 'true', secrets: ['GITHUB_TOKEN'] }], github: { contents: 'write' } })
    await expect(approveWorkflowVersion({ workflowId: narrow.workflowId, hash: narrow.hash, via: 'review' }, { kind: 'person', userId: person.id }))
      .resolves.toMatchObject({ enabled: true })
  })
})

describe('on and off', () => {
  it('turns off, stops runs in progress through the site, and turns on again without a new approval', async () => {
    const { place, admin } = await projectWithAdmin()
    const by = { kind: 'person' as const, userId: admin.id }
    const v1 = await propose(place, deploy())
    await approveWorkflowVersion({ workflowId: v1.workflowId, hash: v1.hash, via: 'review' }, by)
    const version = await prisma.workflowVersion.findFirstOrThrow({ where: { workflowId: v1.workflowId } })
    const run = await prisma.workflowRun.create({
      data: { workflowId: v1.workflowId, versionId: version.id, hash: v1.hash, placeType: 'project', placeId: place.id, siteId: 'site-x', onBehalfOfUserId: admin.id, state: 'RUNNING' },
    })
    const stops: string[] = []
    const sites = { readFiles: async () => ({ ok: false as const, reason: 'missing' as const, path: null, message: '' }), stop: async (_s: string, p: { runId: string }) => { stops.push(p.runId); return { stopped: true, reached: true } } }
    await expect(turnOffWorkflows([v1.workflowId], 'test', admin.id, sites)).resolves.toEqual({ turnedOff: [v1.workflowId], stopped: [run.id] })
    expect(stops).toEqual([run.id])
    await expect(setWorkflowEnabled(v1.workflowId, true, by)).resolves.toEqual({ enabled: true })
    expect(await prisma.workflowApproval.count({ where: { workflowId: v1.workflowId } })).toBe(1)
  })

  it('can\'t turn on a workflow with no approved version, and refuses a non-admin', async () => {
    const { place, admin, project } = await projectWithAdmin()
    const v1 = await propose(place, deploy())
    await expect(setWorkflowEnabled(v1.workflowId, true, { kind: 'person', userId: admin.id })).rejects.toMatchObject({ statusCode: 409 })
    const member = await createUser()
    await joinProjectAs(project.id, member.id, 'MEMBER')
    await expect(turnOffWorkflows([v1.workflowId], 'test', member.id)).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('image upgrades', () => {
  it('keeps the approval with the same tools stage, and otherwise waits while the old version stays approved', async () => {
    const { place, admin } = await projectWithAdmin()
    const v1 = await propose(place, deploy())
    await approveWorkflowVersion({ workflowId: v1.workflowId, hash: v1.hash, via: 'review' }, { kind: 'person', userId: admin.id })
    const old = await prisma.workflowVersion.findFirstOrThrow({ where: { workflowId: v1.workflowId } })
    const from = { digest: DIGEST, release: '1.4.0', toolsKey: 't1' }
    const changed = await upgradeApprovedVersion(old.id, from, { digest: `sha256:${'2'.repeat(64)}`, release: '1.4.1', toolsKey: 't2' })
    expect(changed).toMatchObject({ number: 2, kept: false })
    expect((await prisma.workflowVersion.findUniqueOrThrow({ where: { id: old.id } })).state).toBe('APPROVED')
    const kept = await upgradeApprovedVersion(old.id, from, { digest: `sha256:${'3'.repeat(64)}`, release: '1.4.2', toolsKey: 't1' })
    expect(kept).toMatchObject({ number: 3, kept: true })
    expect((await prisma.workflowVersion.findUniqueOrThrow({ where: { id: old.id } })).state).toBe('SUPERSEDED')
    expect(await prisma.workflowApproval.count({ where: { workflowId: v1.workflowId, automatic: true } })).toBe(1)
  })
})
