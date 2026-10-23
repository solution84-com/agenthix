/**
 * A task's session is kept unless the run needs another runtime and nothing in the session carries on. Which model and
 * runtime a run needs is the resolver's (routing/__tests__/decide.test.ts).
 */
import { describe, it, expect } from 'vitest'
import type { PendingManifest } from '@agenthix/core'
import { keepsTaskSession } from '../taskRunModel'

describe("a task's session @SC-955", () => {
  const base = { sessionRuntime: 'claude-sdk', neededRuntime: 'opencode', paused: false, newestRun: null }
  const run = (
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED',
    manifestStatus: 'APPROVED' | 'PENDING_APPROVAL' | 'REJECTED' | null = null,
    pendingManifest: PendingManifest | null = manifestStatus === 'APPROVED' ? { tools: [{ name: 'Bash' }], bashPatterns: [] } : null,
  ) => ({ status, manifestStatus, pendingManifest })

  it('is kept when it is on the runtime the run needs', () => {
    expect(keepsTaskSession({ ...base, neededRuntime: 'claude-sdk', newestRun: run('COMPLETED') })).toBe(true)
  })

  it('is replaced when the run needs another runtime and nothing in it carries on', () => {
    expect(keepsTaskSession(base)).toBe(false)
    expect(keepsTaskSession({ ...base, newestRun: run('FAILED') })).toBe(false)
    expect(keepsTaskSession({ ...base, newestRun: run('COMPLETED', 'REJECTED') })).toBe(false)
    expect(keepsTaskSession({ ...base, newestRun: run('COMPLETED', 'PENDING_APPROVAL') })).toBe(false)
  })

  it('is kept for a run paused for a scheduled change, which carries on in the same conversation', () => {
    expect(keepsTaskSession({ ...base, paused: true })).toBe(true)
  })

  it('is kept for the run an approval is for, which is given what was approved in the session that asked', () => {
    expect(keepsTaskSession({ ...base, newestRun: run('COMPLETED', 'APPROVED') })).toBe(true)
  })

  it('is replaced after an ordinary run, which the site marks approved with nothing asked', () => {
    expect(keepsTaskSession({ ...base, newestRun: run('FAILED', 'APPROVED', null) })).toBe(false)
    expect(keepsTaskSession({ ...base, newestRun: run('COMPLETED', 'APPROVED', { tools: [], bashPatterns: [] }) })).toBe(false)
  })

  it('is kept while a run in it is still going', () => {
    expect(keepsTaskSession({ ...base, newestRun: run('RUNNING') })).toBe(true)
    expect(keepsTaskSession({ ...base, newestRun: run('PENDING') })).toBe(true)
  })
})
