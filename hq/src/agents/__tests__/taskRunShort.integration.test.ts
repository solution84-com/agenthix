/**
 * A task run that stopped for lack of resources says so on the task, in words, with the limit it hit and who was
 * told (host-management spec §10) — not the raw error.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { addTask, agentInProject, frame, settle, stateOf } from './taskRunFixtures'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../sites/activeRunTracker', () => ({ registerActiveRunTracker: vi.fn() }))
const listeners = vi.hoisted(() => new Map<string, (e: unknown, siteId: string) => Promise<void>>())
vi.mock('../../sites/channel/siteEventHandler', () => ({
  onRunStatus: (name: string, l: (e: unknown, siteId: string) => Promise<void>) => listeners.set(name, l),
}))

import '../TaskRunner'
import * as dispatchFake from '../../test/fakes/dispatchService'

const GIB = 1024 ** 3
let seq = 0

async function failedRun(resource: unknown) {
  const site = await prisma.executionSite.create({ data: { siteId: `short-task-${++seq}-${Date.now()}`, label: 'office-server', protocolVersion: '1.0' } })
  const where = await agentInProject()
  const task = await addTask(where, { runState: 'RUN_ACTIVE', runId: 'run-s' })
  dispatchFake.placeTask(task.id, site.siteId)
  await listeners.get('task-machine')!(frame(task.id, 'run-s', { status: 'FAILED', error: 'Claude Code process exited with code 137', resource } as never), site.siteId)
  await settle()
  return stateOf(task.id)
}

describe('a task run that stopped for lack of resources', () => {
  it('fails with the cause in words, the limit it hit and who was told', async () => {
    expect(await failedRun({ cause: 'memory', limit: 4 * GIB })).toMatchObject({
      runState: 'RUN_FAILED',
      runStateReason: 'This run stopped: it ran out of memory (each run on office-server gets 4 GB). Your fleet admins have been told.',
    })
  })

  it('keeps the error for any other failure', async () => {
    expect(await failedRun(undefined)).toMatchObject({ runState: 'RUN_FAILED', runStateReason: 'Claude Code process exited with code 137' })
  })
})
