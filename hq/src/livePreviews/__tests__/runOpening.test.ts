/**
 * Opening a live preview for `start_app` (live preview spec section 4, *Opening one*): as the run's person, on the run's
 * site, through a person's own path; each refusal comes back in hq's words, ending with what was left as it was.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { FakeHttpError, db } = vi.hoisted(() => ({
  FakeHttpError: class extends Error { constructor(readonly statusCode: number, m?: string) { super(m) } },
  db: { executionSite: { findFirst: vi.fn() } },
}))
vi.mock('wasp/server', () => ({ prisma: db, HttpError: FakeHttpError }))
const mocks = vi.hoisted(() => ({ person: vi.fn(), branch: vi.fn(), start: vi.fn() }))
vi.mock('../../server/controlplane/runOnBehalfOf', () => ({ personOfRun: mocks.person }))
vi.mock('../../branches/branchRows', () => ({ branchOfSession: mocks.branch }))
vi.mock('../opening', () => ({ startLivePreview: mocks.start }))

import { NO_BRANCH, NO_PERSON, NOT_A_PERSONS_RUN, NOT_ALLOWED, openLivePreviewForRun } from '../runOpening'

const CLAIMS = { sessionId: 'session-1', siteId: 'site-1', taskId: 'task-1', userId: 'admin-1', startedBy: 'person' as const }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.person.mockResolvedValue('person-1')
  mocks.branch.mockResolvedValue({ id: 'b-1', workspaceId: 'ws-1' })
  db.executionSite.findFirst.mockResolvedValue({ id: 'es-1' })
  mocks.start.mockResolvedValue({})
})

describe('opening a live preview for a run\'s start_app @SC-1702', () => {
  it('opens it as the run\'s person, on the branch the run works on, on the run\'s site', async () => {
    await openLivePreviewForRun(CLAIMS)
    expect(mocks.start).toHaveBeenCalledWith('person-1', { workspaceId: 'ws-1', branchId: 'b-1', executionSiteId: 'es-1' })
  })

  it.each(['pulse', 'schedule', 'agent', undefined])('refuses a run started by %s, before anything is read', async startedBy => {
    await expect(openLivePreviewForRun({ ...CLAIMS, startedBy: startedBy as never })).rejects.toThrow(NOT_A_PERSONS_RUN)
    expect(mocks.person).not.toHaveBeenCalled()
    expect(mocks.start).not.toHaveBeenCalled()
  })

  it('refuses a run that works for no person', async () => {
    mocks.person.mockResolvedValue(null)
    await expect(openLivePreviewForRun(CLAIMS)).rejects.toThrow(NO_PERSON)
    expect(mocks.start).not.toHaveBeenCalled()
  })

  it('refuses a run on no branch', async () => {
    mocks.branch.mockResolvedValue(null)
    await expect(openLivePreviewForRun(CLAIMS)).rejects.toThrow(NO_BRANCH)
  })

  it('refuses for a person who may only view the project, in words the agent can pass on', async () => {
    mocks.start.mockRejectedValue(new FakeHttpError(403, "Using this project's storage needs a Member or Admin"))
    await expect(openLivePreviewForRun(CLAIMS)).rejects.toThrow(NOT_ALLOWED)
  })

  it('passes on a full site\'s refusal, saying nothing was started', async () => {
    mocks.start.mockRejectedValue(new FakeHttpError(409, 'box has 2 of 2 live previews open. Stop one of yours, or pick another site. Nothing was changed.'))
    await expect(openLivePreviewForRun(CLAIMS)).rejects.toThrow('box has 2 of 2 live previews open. Stop one of yours, or pick another site. Nothing was started.')
  })

  it('passes on live previews being off, saying nothing was started', async () => {
    mocks.start.mockRejectedValue(new FakeHttpError(409, 'That site does not run live previews. Pick one of the sites listed. Nothing was changed.'))
    await expect(openLivePreviewForRun(CLAIMS)).rejects.toThrow(/does not run live previews.*Nothing was started\.$/)
  })
})
