/**
 * The live preview's own workflows are the person's (W13 of the live preview walk): an agent's run_workflow of
 * start-live-preview or reload-live-preview is refused before anything runs, by name or by the workflow it loads.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { FakeHttpError, db, access } = vi.hoisted(() => ({
  FakeHttpError: class extends Error { constructor(readonly statusCode: number, m?: string) { super(m) } },
  db: { workflow: { findUnique: vi.fn() } },
  access: vi.fn(),
}))
vi.mock('wasp/server', () => ({ prisma: db, HttpError: FakeHttpError }))
vi.mock('../placeAccess', () => ({ requireMayStartRunsInPlace: access }))
// Nothing past the workflow's lookup is reached here.
vi.mock('../integrationValues', () => ({}))
vi.mock('../runsSite', () => ({ runSiteCalls: {} }))
vi.mock('../siteWorkflows', () => ({ siteCalls: {} }))
vi.mock('../starters/runGuards', () => ({ guardStarterRun: vi.fn() }))
vi.mock('../../secrets/store', () => ({}))
vi.mock('../../secrets/variables', () => ({}))
vi.mock('../../storage/storageSite', () => ({}))
vi.mock('../runsInstruction', () => ({}))
vi.mock('../runsLive', () => ({}))
vi.mock('../versionContent', () => ({}))

import { livePreviewWorkflowRefusal, startWorkflowRun, type RunStarter, type StartRunInput } from '../runs'

const PLACE = { type: 'project' as const, id: 'p-1' }
const WORKSPACE = { ownerType: 'project' as const, ownerId: 'p-1', workspaceId: 'ws-1' }
const AGENT: RunStarter = { kind: 'agent', agentId: 'a-1', agentRunId: 'r-1', onBehalfOfUserId: 'u-1', sessionId: 's-1' }
const input = (over: Partial<StartRunInput>): StartRunInput => ({ place: PLACE, workspace: WORKSPACE, workflow: { name: 'deploy' }, parameters: {}, starter: AGENT, ...over })

beforeEach(() => {
  vi.clearAllMocks()
  access.mockResolvedValue(undefined)
})

describe('an agent never runs the live preview\'s own workflows', () => {
  it.each(['start-live-preview', 'reload-live-preview', ' Start-Live-Preview '])('refuses %s by name, before anything is read', async name => {
    await expect(startWorkflowRun(input({ workflow: { name } }))).rejects.toMatchObject({ statusCode: 403, message: livePreviewWorkflowRefusal(name) })
    expect(db.workflow.findUnique).not.toHaveBeenCalled()
    expect(access).not.toHaveBeenCalled()
  })

  it('refuses one named by its id, once it is loaded', async () => {
    db.workflow.findUnique.mockResolvedValue({ id: 'wf-1', name: 'start-live-preview', placeType: 'project', placeId: 'p-1', versions: [] })
    await expect(startWorkflowRun(input({ workflow: { id: 'wf-1' } }))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses an agent\'s run aimed at a live preview', async () => {
    await expect(startWorkflowRun(input({ livePreview: { id: 'lp-1', siteId: 'site-1' } }))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('says whose it is, what to use instead, and that nothing was changed', () => {
    const words = livePreviewWorkflowRefusal('start-live-preview')
    expect(words).toContain("start-live-preview is the person's")
    expect(words).toContain('Start with secrets')
    expect(words).toContain('start_app')
    expect(words).toMatch(/Nothing was changed\.$/)
  })

  it('lets a person\'s start of it go on to the usual checks', async () => {
    db.workflow.findUnique.mockResolvedValue(null)
    await expect(startWorkflowRun(input({ workflow: { name: 'start-live-preview' }, starter: { kind: 'person', userId: 'u-1' } })))
      .rejects.toMatchObject({ statusCode: 404 })
    expect(access).toHaveBeenCalled()
  })
})
