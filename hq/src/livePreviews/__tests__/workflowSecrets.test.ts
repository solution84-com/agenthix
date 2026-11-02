/**
 * Secrets into a live preview through the place's approved workflow (live preview spec section 4, *Secrets*;
 * adr-0171): hq checks the person, the live preview and the workflow, then the workflows' own run path sends the run to
 * the site the live preview runs on, aimed at it. The screen offers each workflow only when the place has it approved
 * and switched on.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  workflow: null as null | { enabled: boolean; versions: { id: string }[] },
  found: [] as { name: string }[],
  findMany: vi.fn(),
  runs: new Map<string, { state: string; failureMessage: string | null; endedAt: Date | null; createdAt: Date; version: { definition: unknown } }>(),
}))
vi.mock('wasp/server', () => ({
  HttpError: class HttpError extends Error {
    constructor(public statusCode: number, message?: string, public data?: unknown) { super(message) }
  },
  prisma: {
    workflow: {
      findUnique: async () => db.workflow,
      findMany: async (q: unknown) => { db.findMany(q); return db.found },
    },
    workflowRun: { findUnique: async (q: { where: { id: string } }) => db.runs.get(q.where.id) ?? null },
  },
}))
const reached = vi.hoisted(() => ({ state: 'RUNNING' }))
vi.mock('../personActions', () => ({
  reachLivePreview: async () => ({
    row: { id: 'lp-1', state: reached.state, ownerType: 'project', ownerId: 'p1', workspaceId: 'w1', executionSiteId: 'es-2' },
    site: { siteId: 'site-preview', name: 'preview-box' },
    canAct: true,
  }),
}))
vi.mock('../../workflows/placeAccess', () => ({ requireMayStartRunsInPlace: async () => {} }))
const started = vi.hoisted(() => ({ calls: [] as unknown[] }))
const gate = vi.hoisted(() => ({ wait: null as null | Promise<void> }))
vi.mock('../../workflows/runs', () => ({
  startWorkflowRun: async (input: unknown) => {
    started.calls.push(input)
    if (gate.wait) await gate.wait
    return { runId: `run-${started.calls.length}` }
  },
}))

import { liveWorkflowsOf, provideLivePreviewWorkflowDelivery, runLivePreviewWorkflow } from '../workflowSecrets'
import { deliverLivePreviewWorkflow } from '../../workflows/livePreviewRuns'
import { forgetSecretsRunsForTests, secretsRunOf } from '../secretsRuns'

const STEPS = { steps: [{ secrets: ['SHOP_API_KEY'] }, { secrets: ['GITHUB_TOKEN', 'DB_URL', 'SHOP_API_KEY'] }] }
const ranAs = (state: string, failureMessage: string | null = null) => ({
  state, failureMessage, endedAt: state === 'RUNNING' ? null : new Date('2026-11-02T07:11:10Z'),
  createdAt: new Date('2026-11-02T07:11:03Z'), version: { definition: STEPS },
})

beforeEach(() => {
  db.workflow = { enabled: true, versions: [{ id: 'v1' }] }
  db.found = []
  db.findMany.mockClear()
  reached.state = 'RUNNING'
  started.calls = []
  gate.wait = null
  db.runs.clear()
  forgetSecretsRunsForTests()
  provideLivePreviewWorkflowDelivery(null)
})

describe('running a live preview\'s workflow @SC-1712', () => {
  it('goes through the workflows\' run path to the site the live preview runs on, aimed at it', async () => {
    provideLivePreviewWorkflowDelivery(deliverLivePreviewWorkflow)
    expect(await runLivePreviewWorkflow('u1', 'lp-1', 'start')).toEqual({ runId: 'run-1' })
    expect(started.calls).toEqual([{
      place: { type: 'project', id: 'p1' },
      workspace: { ownerType: 'project', ownerId: 'p1', workspaceId: 'w1' },
      workflow: { name: 'start-live-preview' },
      parameters: {},
      starter: { kind: 'person', userId: 'u1' },
      livePreview: { id: 'lp-1', siteId: 'site-preview' },
    }])
  })

  it("goes on the strip: going, then the names handed (never a minted one), or the run's own words for a failure", async () => {
    provideLivePreviewWorkflowDelivery(deliverLivePreviewWorkflow)
    expect(await secretsRunOf('lp-1')).toBeNull()
    await runLivePreviewWorkflow('u1', 'lp-1', 'start')
    db.runs.set('run-1', ranAs('RUNNING'))
    expect(await secretsRunOf('lp-1')).toMatchObject({ runId: 'run-1', kind: 'start', state: 'going', names: [], message: null })
    db.runs.set('run-1', ranAs('PASSED'))
    expect(await secretsRunOf('lp-1')).toMatchObject({ state: 'passed', names: ['DB_URL', 'SHOP_API_KEY'], at: '2026-11-02T07:11:10.000Z' })
    db.runs.set('run-1', ranAs('FAILED', 'The run passed, but the live preview stopped or paused meanwhile.'))
    expect(await secretsRunOf('lp-1')).toMatchObject({ state: 'failed', names: [], message: 'The run passed, but the live preview stopped or paused meanwhile.' })
    expect(await secretsRunOf('lp-other')).toBeNull()
  })

  it('cannot be started again while one runs on the live preview, and can once it ended', async () => {
    provideLivePreviewWorkflowDelivery(deliverLivePreviewWorkflow)
    let letGo = () => {}
    gate.wait = new Promise<void>(r => { letGo = r })
    const first = runLivePreviewWorkflow('u1', 'lp-1', 'start')
    await expect(runLivePreviewWorkflow('u1', 'lp-1', 'start')).rejects.toMatchObject({ statusCode: 409, data: { code: 'running' } })
    letGo()
    await first
    gate.wait = null
    db.runs.set('run-1', ranAs('RUNNING'))
    await expect(runLivePreviewWorkflow('u1', 'lp-1', 'reload')).rejects.toMatchObject({ data: { code: 'running' } })
    expect(started.calls).toHaveLength(1)
    db.runs.set('run-1', ranAs('PASSED'))
    expect(await runLivePreviewWorkflow('u1', 'lp-1', 'reload')).toEqual({ runId: 'run-2' })
  })

  it('runs reload-live-preview for a reload', async () => {
    provideLivePreviewWorkflowDelivery(deliverLivePreviewWorkflow)
    await runLivePreviewWorkflow('u1', 'lp-1', 'reload')
    expect(started.calls[0]).toMatchObject({ workflow: { name: 'reload-live-preview' } })
  })

  it('is refused, with nothing run, for a live preview that is not running, or a workflow not approved or switched off', async () => {
    provideLivePreviewWorkflowDelivery(deliverLivePreviewWorkflow)
    reached.state = 'STOPPED'
    await expect(runLivePreviewWorkflow('u1', 'lp-1', 'start')).rejects.toMatchObject({ statusCode: 409 })
    reached.state = 'RUNNING'
    db.workflow = { enabled: true, versions: [] }
    await expect(runLivePreviewWorkflow('u1', 'lp-1', 'start')).rejects.toMatchObject({ data: { code: 'notApproved' } })
    db.workflow = { enabled: false, versions: [{ id: 'v1' }] }
    await expect(runLivePreviewWorkflow('u1', 'lp-1', 'start')).rejects.toMatchObject({ data: { code: 'switchedOff' } })
    db.workflow = null
    await expect(runLivePreviewWorkflow('u1', 'lp-1', 'start')).rejects.toMatchObject({ data: { code: 'noWorkflow' } })
    expect(started.calls).toEqual([])
  })
})

describe('which workflows the screen offers @SC-1712', () => {
  it('only those the place has approved and switched on', async () => {
    db.found = [{ name: 'reload-live-preview' }]
    expect(await liveWorkflowsOf({ type: 'project', id: 'p1' })).toEqual({ start: false, reload: true })
    expect(db.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ placeType: 'project', placeId: 'p1', enabled: true, versions: { some: { state: 'APPROVED' } } }),
    }))
  })
})
