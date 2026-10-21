/**
 * The reconnect hook `startSiteChannel` wires: a site that connects is sent
 * the instructions held for it (person-scoped execution spec §4), beside the
 * task sweep and never in its way.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  deps: null as null | { onSiteConnected?: (siteId: string) => void },
  deliverHeldInstructions: vi.fn(),
  reconcileSite: vi.fn(),
  reconcileDanglingSessions: vi.fn(),
}))

vi.mock('../siteChannelServer', () => ({ attachSiteChannel: (_server: unknown, deps: typeof h.deps) => { h.deps = deps } }))
vi.mock('../../heldInstructions', () => ({ deliverHeldInstructions: h.deliverHeldInstructions }))
vi.mock('../../../agents/reconcileService', () => ({ reconcileSite: h.reconcileSite }))
vi.mock('../../../agents/TaskRunner', () => import('../../../test/fakes/TaskRunner'))
vi.mock('../../../sessions/danglingSessionReconciler', () => ({ reconcileDanglingSessions: h.reconcileDanglingSessions }))
vi.mock('../../registrationService', () => ({ authenticateSite: vi.fn(), siteExists: vi.fn() }))
vi.mock('../siteEventHandler', () => ({ handleSiteEvent: vi.fn() }))
vi.mock('../siteStatusStore', () => ({ prismaSiteStatusStore: {}, markAllOfflineAtBoot: vi.fn() }))

import { startSiteChannel } from '../index'
import * as taskRunnerFake from '../../../test/fakes/TaskRunner'

beforeEach(() => {
  vi.resetAllMocks()
  h.reconcileSite.mockResolvedValue(undefined)
  taskRunnerFake.taskRunner.drainHeldTasks.mockResolvedValue(undefined)
  h.reconcileDanglingSessions.mockResolvedValue(undefined)
  startSiteChannel({} as never)
})

describe('onSiteConnected', () => {
  it('sends the connecting site the instructions held for it', async () => {
    h.deliverHeldInstructions.mockResolvedValue(undefined)

    h.deps!.onSiteConnected!('s1')

    expect(h.deliverHeldInstructions).toHaveBeenCalledWith('s1')
  })

  it('runs the task sweep without waiting for the instructions to be answered', async () => {
    h.deliverHeldInstructions.mockReturnValue(new Promise(() => {}))

    h.deps!.onSiteConnected!('s1')
    await vi.waitFor(() => expect(h.reconcileDanglingSessions).toHaveBeenCalledWith('s1'))

    expect(h.reconcileSite).toHaveBeenCalled()
    expect(taskRunnerFake.taskRunner.drainHeldTasks).toHaveBeenCalledWith('s1')
  })
})
