import { vi } from 'vitest'
import type * as Real from '../../agents/dispatchService'
import { resetBeforeEachTest, type MissingFrom, type Spy } from './lifecycle'

export const TASK_INPUT_MESSAGE = 'Execute your assigned task.'
export const TASK_CONTINUE_MESSAGE = 'Your work on this task was paused part way for scheduled maintenance, which is now done. Carry on from where you stopped.'

/** The site every task and session resolves to unless a test places it elsewhere. */
export const DEFAULT_SITE_ID = 'site-1'

type Dispatched = { siteId: string; sessionId: string; runId: string }

const taskSites = new Map<string, string | Error>()
const sessionSites = new Map<string, string | Error>()
let runCount = 0

/** Every chat run dispatched since the last reset, in order, with the site it went to. */
export const dispatchedChatRuns: Array<Dispatched & { inputText: string }> = []
/** Every task run dispatched since the last reset, in order, with the site it went to. */
export const dispatchedTaskRuns: Array<Dispatched & { taskId: string }> = []

function siteOf(sites: Map<string, string | Error>, key: string): string {
  const placed = sites.get(key) ?? DEFAULT_SITE_ID
  if (placed instanceof Error) throw placed
  return placed
}

export const resolveSiteIdForTask: Spy<typeof Real.resolveSiteIdForTask> = vi.fn(async (taskId) => siteOf(taskSites, taskId))

export const resolveSiteIdForSession: Spy<typeof Real.resolveSiteIdForSession> = vi.fn(async (session) => siteOf(sessionSites, (session as { id?: string }).id ?? ''))

export const dispatchChatRun: Spy<typeof Real.dispatchChatRun> = vi.fn(async (sessionId, inputText) => {
  const runId = `run-${++runCount}`
  dispatchedChatRuns.push({ siteId: siteOf(sessionSites, sessionId), sessionId, runId, inputText })
  return { runId }
})

export const dispatchTaskRun: Spy<typeof Real.dispatchTaskRun> = vi.fn(async (taskId) => {
  const runId = `run-${++runCount}`
  const sessionId = `session-${taskId}`
  dispatchedTaskRuns.push({ siteId: siteOf(taskSites, taskId), sessionId, runId, taskId })
  return { runId, sessionId }
})

export const buildContext: Spy<typeof Real.buildContext> = vi.fn(async () => {
  throw new Error('the dispatchService fake does not build a run context; stub buildContext in the test that needs one')
})

/** This task resolves to `siteId`, or its resolution fails with the given error (an unplaced project, say). */
export function placeTask(taskId: string, siteId: string | Error): void {
  taskSites.set(taskId, siteId)
}

/** This session resolves to `siteId`, or its resolution fails with the given error. */
export function placeSession(sessionId: string, siteId: string | Error): void {
  sessionSites.set(sessionId, siteId)
}

export function reset(): void {
  taskSites.clear()
  sessionSites.clear()
  dispatchedChatRuns.length = 0
  dispatchedTaskRuns.length = 0
  runCount = 0
  for (const spy of [resolveSiteIdForTask, resolveSiteIdForSession, dispatchChatRun, dispatchTaskRun, buildContext]) {
    spy.mockReset()
  }
}

resetBeforeEachTest(reset)

export const _exportsEveryRealName: MissingFrom<typeof Real, typeof import('./dispatchService')> extends never ? true : never = true
