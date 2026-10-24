/**
 * Runs against the real test database (spec part 2, *From run to result*, hq's steps 1–3 and 7): the checks before a
 * run, what the run instruction carries and what it never does, the record of use, the step events and the result,
 * the agent's limit, stopping, and the switch's history. The site is a stand-in that captures what it is sent. Every
 * value is a canary.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUser, joinProjectAs } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
// The site's answer for the workspace's connection: none, so the mint gate refuses GITHUB_TOKEN.
vi.mock('../../storage/workspaceStore', async () => ({
  ...(await vi.importActual<object>('../../storage/workspaceStore')),
  getRepoForTarget: vi.fn(async () => null),
}))

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 9).toString('base64')

import type { WorkflowReadFilesResult, WorkflowRunInstruction } from '@agenthix/core'
import { readProposal } from '../proposalContent'
import { storeVersion } from '../propose'
import { approveWorkflowVersion } from '../approve'
import { setWorkflowEnabled, turnOffWorkflows, listWorkflowSwitches } from '../switch'
import { startWorkflowRun, stopWorkflowRun, type RunDeps, type RunStarter } from '../runs'
import { handleWorkflowResultEvent, handleWorkflowStepEvent } from '../runsEvents'
import { addSecret } from '../../secrets/store'
import { addVariable } from '../../secrets/variables'
import { maskFormHmac } from '../runsMasking'

const CANARY = 'CANARY-7c1a-not-a-real-secret-55e2'
const OTHER = 'CANARY-other-secret-of-the-place-91'
const DIGEST = `sha256:${'1'.repeat(64)}`
const DESC = { description: 'Deploys to staging', issuer: 'staging', renewAt: '' }

const definition = {
  name: 'deploy',
  description: 'Deploy',
  variables: ['STAGING_HOST'],
  parameters: [{ name: 'ref', pattern: '^[a-z]{1,20}$' }],
  steps: [
    { name: 'Build', run: 'true' },
    { name: 'Upload', run: 'true', secrets: ['KEY'] },
  ],
}

type Sent = { siteId: string; instruction: WorkflowRunInstruction }

function standInSite(answer: 'accepted' | 'refused' | 'unreachable' = 'accepted') {
  const sent: Sent[] = []
  const stops: string[] = []
  const deps: RunDeps = {
    site: {
      async run(siteId, instruction) {
        sent.push({ siteId, instruction })
        return answer === 'refused' ? { sent: 'refused', message: 'This site is busy. Nothing was changed.' } : { sent: answer }
      },
      async get() { return null },
    },
    stop: { async stop(_siteId, p) { stops.push(p.runId); return { stopped: true, reached: true } } },
  }
  return { deps, sent, stops }
}

let place: { type: 'project'; id: string }
let admin: { id: string }
let member: { id: string }
let viewer: { id: string }
let workflowId: string
let siteId: string

async function proposeAndApprove(def: Record<string, unknown> = definition) {
  const sites = {
    async readFiles(): Promise<WorkflowReadFilesResult> {
      return { ok: true, files: [{ path: 'workflow.yaml', contentBase64: Buffer.from(JSON.stringify(def)).toString('base64'), executable: false }] }
    },
  }
  const read = await readProposal('site', { ownerType: 'project', ownerId: place.id, workspaceId: null }, 'workflow.yaml', {
    sites, readYaml: (t) => ({ ok: true, data: JSON.parse(t) }),
    secretNames: async () => ['KEY', 'OTHER'], variableNames: async () => ['STAGING_HOST'], executorImageDigest: DIGEST,
  })
  if (!read.ok) throw new Error(read.message)
  const result = await storeVersion(place, read.proposal, { kind: 'starter' }, () => {})
  await prisma.workflowVersion.updateMany({ where: { hash: result.hash }, data: { checkFlags: [], cardMayApprove: true } })
  const workflow = await prisma.workflow.findFirstOrThrow({ where: { placeId: place.id, name: result.workflow } })
  await approveWorkflowVersion({ workflowId: workflow.id, hash: result.hash, via: 'review' }, { kind: 'person', userId: admin.id })
  return workflow.id
}

const workspace = () => ({ ownerType: 'project' as const, ownerId: place.id, workspaceId: null })
const asPerson = (userId: string): RunStarter => ({ kind: 'person', userId })
const asAgent = (n = 1): RunStarter => ({ kind: 'agent', agentId: 'agent-1', agentRunId: `agent-run-${n}`, onBehalfOfUserId: member.id, sessionId: 'session-1' })

function start(starter: RunStarter, deps: RunDeps, parameters: Record<string, unknown> = { ref: 'main' }) {
  return startWorkflowRun({ place, workspace: workspace(), workflow: { name: 'deploy' }, parameters, starter }, deps)
}

beforeEach(async () => {
  const project = await createProject()
  place = { type: 'project', id: project.id }
  admin = await createUser()
  member = await createUser()
  viewer = await createUser()
  await joinProjectAs(project.id, admin.id, 'ADMIN')
  await joinProjectAs(project.id, member.id, 'MEMBER')
  await joinProjectAs(project.id, viewer.id, 'VIEWER')
  await addSecret(place, admin.id, { name: 'KEY', value: { kind: 'text', text: CANARY }, ...DESC })
  await addSecret(place, admin.id, { name: 'OTHER', value: { kind: 'text', text: OTHER }, ...DESC })
  await addVariable(place, admin.id, 'STAGING_HOST', 'staging.example.com')
  workflowId = await proposeAndApprove()
  siteId = (await prisma.project.findUniqueOrThrow({ where: { id: project.id }, select: { executionSite: { select: { siteId: true } } } })).executionSite!.siteId
})

describe('starting a run', () => {
  it('sends each step only the secrets it names, the variables, the checked parameters and the image', async () => {
    const { deps, sent } = standInSite()
    const { runId } = await start(asPerson(member.id), deps)
    expect(sent).toHaveLength(1)
    const ins = sent[0].instruction
    expect(sent[0].siteId).toBe(siteId)
    expect(ins.runId).toBe(runId)
    expect(ins.steps).toEqual([{ secrets: {} }, { secrets: { KEY: Buffer.from(CANARY).toString('base64') } }])
    expect(ins.variables).toEqual({ STAGING_HOST: 'staging.example.com' })
    expect(ins.parameters).toEqual({ ref: 'main' })
    expect(ins.executorImageDigest).toBe(DIGEST)
    const run = await prisma.workflowRun.findUniqueOrThrow({ where: { id: runId }, include: { steps: true } })
    expect(run).toMatchObject({ state: 'WAITING', onBehalfOfUserId: member.id, agentId: null, siteId })
    expect(run.steps.map((s) => s.name).sort()).toEqual(['Build', 'Upload'])
  })

  it('masks every secret of the place, but sends no other secret in any form', async () => {
    const { deps, sent } = standInSite()
    await start(asPerson(member.id), deps)
    const ins = sent[0].instruction
    const key = Buffer.from(ins.masking.key, 'base64')
    const names = new Set(ins.masking.forms.map((f) => f.secretName))
    expect(names).toEqual(new Set(['KEY', 'OTHER']))
    expect(ins.masking.forms).toContainEqual(expect.objectContaining({ length: OTHER.length, hmac: maskFormHmac(key, Buffer.from(OTHER)), secretName: 'OTHER', class: 'raw' }))
    const wire = JSON.stringify(ins)
    expect(wire.includes(OTHER)).toBe(false)
    expect(wire.includes(Buffer.from(OTHER).toString('base64'))).toBe(false)
    expect(JSON.stringify(ins.masking).includes(CANARY)).toBe(false)
  })

  it('records the use of each secret given, never of one only masked', async () => {
    const { deps } = standInSite()
    const { runId } = await start(asPerson(member.id), deps)
    const used = await prisma.secretRecord.findMany({ where: { runId, action: 'USED' } })
    expect(used.map((u) => u.secretName)).toEqual(['KEY'])
    expect(used[0].byUserId).toBe(member.id)
  })

  it('refuses a viewer, and an agent run on behalf of one', async () => {
    const { deps, sent } = standInSite()
    await expect(start(asPerson(viewer.id), deps)).rejects.toMatchObject({ statusCode: 403 })
    await expect(start({ ...asAgent(), onBehalfOfUserId: viewer.id } as RunStarter, deps)).rejects.toMatchObject({ statusCode: 403 })
    expect(sent).toHaveLength(0)
  })

  it('refuses a workflow that is off, a bad parameter, and leaves nothing behind', async () => {
    const { deps, sent } = standInSite()
    await expect(start(asPerson(member.id), deps, { ref: '--force' })).rejects.toMatchObject({ statusCode: 422 })
    await setWorkflowEnabled(workflowId, false, { kind: 'person', userId: admin.id })
    await expect(start(asPerson(member.id), deps)).rejects.toMatchObject({ statusCode: 409 })
    expect(sent).toHaveLength(0)
    expect(await prisma.workflowRun.count({ where: { workflowId } })).toBe(0)
  })

  it('refuses a run asked from another place', async () => {
    const { deps } = standInSite()
    const other = await createProject()
    await joinProjectAs(other.id, member.id, 'MEMBER')
    await expect(startWorkflowRun({
      place: { type: 'project', id: other.id }, workspace: { ownerType: 'project', ownerId: other.id, workspaceId: null },
      workflow: { id: workflowId }, parameters: { ref: 'main' }, starter: asPerson(member.id),
    }, deps)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses a version whose stored content no longer hashes as approved', async () => {
    const { deps, sent } = standInSite()
    const v = await prisma.workflowVersion.findFirstOrThrow({ where: { workflowId, state: 'APPROVED' } })
    await prisma.workflowVersion.update({ where: { id: v.id }, data: { definition: { ...(v.definition as object), description: 'changed' } } })
    await expect(start(asPerson(member.id), deps)).rejects.toMatchObject({ statusCode: 409 })
    expect(sent).toHaveLength(0)
  })

  it('stops an agent at its runs for the hour, and not a person', async () => {
    const { deps } = standInSite()
    await prisma.workflow.update({ where: { id: workflowId }, data: { agentRunsPerHour: 2 } })
    await start(asAgent(1), deps)
    await start(asAgent(2), deps)
    await expect(start(asAgent(3), deps)).rejects.toMatchObject({ statusCode: 429 })
    await start(asPerson(member.id), deps)
  })

  it('leaves nothing when the site refuses or cannot be reached', async () => {
    await expect(start(asPerson(member.id), standInSite('refused').deps)).rejects.toThrow(/busy/)
    await expect(start(asPerson(member.id), standInSite('unreachable').deps)).rejects.toMatchObject({ statusCode: 503 })
    expect(await prisma.workflowRun.count({ where: { workflowId } })).toBe(0)
    expect(await prisma.secretRecord.count({ where: { action: 'USED' } })).toBe(0)
  })

  it('refuses GITHUB_TOKEN through the mint gate when the workspace has no repository connected, leaving nothing', async () => {
    const { deps, sent } = standInSite()
    await proposeAndApprove({ name: 'push', github: { contents: 'write' }, steps: [{ name: 'Push', run: 'true', secrets: ['GITHUB_TOKEN'] }] })
    await expect(startWorkflowRun({ place, workspace: workspace(), workflow: { name: 'push' }, parameters: {}, starter: asPerson(member.id) }, deps))
      .rejects.toThrow(/no GitHub repository connected/)
    expect(sent).toHaveLength(0)
    expect(await prisma.workflowRun.count({ where: { workflow: { name: 'push' } } })).toBe(0)
    expect(await prisma.workflowMintedToken.count()).toBe(0)
  })
})

describe('events and the result', () => {
  it('moves the steps, ends the run, and records and tells of a printed secret', async () => {
    const { deps } = standInSite()
    const { runId } = await start(asPerson(member.id), deps)
    const now = new Date().toISOString()
    await handleWorkflowStepEvent(siteId, { runId, index: 0, name: 'Build', state: 'running', startedAt: now, endedAt: null, exitCode: null, outputTail: 'building', outputTruncated: false })
    expect(await prisma.workflowRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({ state: 'RUNNING' })
    await handleWorkflowResultEvent(siteId, {
      runId, state: 'passed', startedAt: now, endedAt: now, failure: null,
      steps: [
        { index: 0, name: 'Build', state: 'passed', startedAt: now, endedAt: now, exitCode: 0, output: 'built\n', outputTruncated: false },
        { index: 1, name: 'Upload', state: 'passed', startedAt: now, endedAt: now, exitCode: 0, output: 'key: ***\n', outputTruncated: false },
      ],
      printedSecretNames: ['KEY'], leaks: [], writeBack: { changed: ['dist/app.js'], conflicts: [] },
    })
    const run = await prisma.workflowRun.findUniqueOrThrow({ where: { id: runId }, include: { steps: { orderBy: { index: 'asc' } } } })
    expect(run).toMatchObject({ state: 'PASSED', printedSecret: true, writeBack: { changed: ['dist/app.js'], conflicts: [] } })
    expect(run.steps.map((s) => s.state)).toEqual(['PASSED', 'PASSED'])
    expect(await prisma.secretRecord.count({ where: { runId, action: 'PRINTED', secretName: 'KEY' } })).toBe(1)
    expect(await prisma.notification.count({ where: { userId: admin.id, type: 'workflow_printed_secret' } })).toBe(1)
  })

  it('ignores a frame from a site that does not run it', async () => {
    const { deps } = standInSite()
    const { runId } = await start(asPerson(member.id), deps)
    await handleWorkflowStepEvent('another-site', { runId, index: 0, name: 'Build', state: 'running', startedAt: null, endedAt: null, exitCode: null, outputTail: '', outputTruncated: false })
    expect(await prisma.workflowRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({ state: 'WAITING' })
  })

  it('stops a run for a member, refuses a viewer', async () => {
    const { deps, stops } = standInSite()
    const { runId } = await start(asPerson(member.id), deps)
    await expect(stopWorkflowRun(runId, viewer.id, deps.stop)).rejects.toMatchObject({ statusCode: 403 })
    expect(await stopWorkflowRun(runId, member.id, deps.stop)).toEqual({ stopped: true })
    expect(stops).toEqual([runId])
  })
})

describe('the switch history', () => {
  it('keeps every switch, who and why', async () => {
    await setWorkflowEnabled(workflowId, false, { kind: 'person', userId: admin.id })
    await setWorkflowEnabled(workflowId, true, { kind: 'person', userId: admin.id })
    await turnOffWorkflows([workflowId], 'the secret KEY was turned off', admin.id, { readFiles: vi.fn(), stop: async () => ({ stopped: false, reached: true }) } as any)
    const switches = await listWorkflowSwitches(workflowId)
    expect(switches.map((s) => [s.enabled, s.byUserId, s.reason])).toEqual([
      [false, admin.id, 'the secret KEY was turned off'],
      [true, admin.id, 'turned on'],
      [false, admin.id, 'turned off'],
      [true, admin.id, 'first version approved'],
    ])
  })
})
