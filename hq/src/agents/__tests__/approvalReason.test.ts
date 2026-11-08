/** A task run's approval card and notification say why it asks, never its result. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RunStatusEvent } from '@agenthix/core'

const { getRun } = vi.hoisted(() => ({ getRun: vi.fn() }))
vi.mock('../../sessions/siteRuntimeStore', () => ({ getRun }))

import { approvalReasonOfRun } from '../approvalReason'
import { NO_REASON } from '../../conversations/work/workers/runReads'

const asked = (summary: string | null, bashPatterns: string[]): RunStatusEvent => ({
  runId: 'run-1', sessionId: 's1', taskId: 't1', agentId: 'a1', agentHandle: 'dev', status: 'COMPLETED', error: null,
  sessionPatch: null, manifestPending: { runId: 'run-1', summary, pendingManifest: { tools: [], bashPatterns: bashPatterns.map(pattern => ({ pattern })) } },
})

beforeEach(() => { getRun.mockReset() })

describe('approvalReasonOfRun', () => {
  it('takes the sentence of the run\'s whole reply about what it asked for', async () => {
    getRun.mockResolvedValue({ outputText: 'The notes are drafted.\n\nI need to run `make docs` to check the links render.' })
    expect(await approvalReasonOfRun('site-1', asked('The notes are drafted.', ['make docs'])))
      .toBe('I need to run make docs to check the links render.')
  })

  it('never gives a finished run\'s result as the reason: it names the command it tried, or that it did not say why', async () => {
    const result = 'All done: the release notes are written and the task is complete.'
    getRun.mockResolvedValue({ outputText: result })
    expect(await approvalReasonOfRun('site-1', asked(result, ['ls']))).toBe('It tried to run “ls”.')
    expect(await approvalReasonOfRun('site-1', asked(result, []))).toBe(NO_REASON)
  })

  it('reads the frame\'s excerpt when the site cannot be read', async () => {
    getRun.mockRejectedValue(new Error('unreachable'))
    expect(await approvalReasonOfRun('site-1', asked('I would like approval to run ls first.', ['ls']))).toBe('I would like approval to run ls first.')
  })
})
