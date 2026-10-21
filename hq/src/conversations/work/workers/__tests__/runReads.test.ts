/**
 * What a worker's run gives back (workers and results spec, Results › Worker): its stated result, else its last
 * reply, capped; what it asks to do and why; and the frame a run's row stands for.
 */
import { describe, it, expect } from 'vitest'
import type { RunRow } from '@agenthix/core'
import { RESULT_CAP_CHARS, RESULT_TOO_LARGE } from '../../../../shared/conversations/protocol'
import {
  APPROVAL_REASON_MAX_CHARS, NO_REASON, NO_SUMMARY, capText, continueAfterApprovalText, frameOfRun, requestReason, requestedWhat, workerResult,
} from '../runReads'

describe("a worker's result summary @SC-962", () => {
  it('is the result the run stated, when it stated one', () => {
    expect(workerResult('r1', { result: ' Found three issues. ', stated: true }, 'Done, see above.')).toEqual({ summary: 'Found three issues.', stated: true, runId: 'r1' })
  })

  it('is its last reply, marked not stated, when it stated none', () => {
    expect(workerResult('r1', null, 'I checked the README.')).toEqual({ summary: 'I checked the README.', stated: false, runId: 'r1' })
    expect(workerResult('r1', { result: null, stated: false }, 'Last words')).toMatchObject({ summary: 'Last words', stated: false })
  })

  it('says so when the run said nothing at all', () => {
    expect(workerResult('r1', null, '  ')).toEqual({ summary: NO_SUMMARY, stated: false, runId: 'r1' })
  })

  it('is capped, ending with the line that tells the lead to brief a worker', () => {
    const { summary } = workerResult('r1', null, 'x'.repeat(RESULT_CAP_CHARS + 50))
    expect(summary).toHaveLength(RESULT_CAP_CHARS)
    expect(summary.endsWith(`[${RESULT_TOO_LARGE}]`)).toBe(true)
    expect(capText('short')).toBe('short')
  })
})

describe("a worker's approval request @SC-964", () => {
  const LS = { bashPatterns: [{ pattern: 'ls', reason: 'ls -la /workspace' }] }

  it('names what it would use, in plain words', () => {
    expect(requestedWhat({ tools: [{ name: 'WebFetch' }], bashPatterns: [{ pattern: 'npm run bench' }] })).toBe('Use WebFetch and run “npm run bench”')
    expect(requestedWhat(LS)).toBe('Run “ls”')
    expect(requestedWhat(null)).toBe('Use a tool that needs approval')
  })

  it('gives as its reason what the run said about the request, never the result it went on to give', () => {
    const reply = [
      '## Part 1', '', '**The personal space is empty.** There are no files yet.', '',
      'I tried to run `ls` to double-check the hidden files, which needs your approval.', '',
      '## Part 2', '', '- Nothing looks unfinished.',
    ].join('\n')
    expect(requestReason(reply, LS)).toBe('I tried to run ls to double-check the hidden files, which needs your approval.')
  })

  it('takes the last sentence about it, matched by the command or tool name as a word', () => {
    const reply = 'I listed the folder. Also I need WebFetch to read the changelog. The tools look fine.'
    expect(requestReason(reply, { tools: [{ name: 'WebFetch' }] })).toBe('Also I need WebFetch to read the changelog.')
    expect(requestReason('The files are listed below.', LS)).not.toContain('listed')
  })

  it('else the sentence in which it says what it needs; never a sentence that says neither', () => {
    expect(requestReason('Found three files. I need to run the benchmark to measure the resize step. Then I stop.', { bashPatterns: [{ pattern: 'npm run bench' }] }))
      .toBe('I need to run the benchmark to measure the resize step.')
    expect(requestReason('Your space is empty.', { tools: [{ name: 'Bash' }] })).toBe(NO_REASON)
  })

  it('says the command it tried when the run said nothing about it, or that it gave no reason', () => {
    expect(requestReason('**The personal space is empty.**\n\n## Part 2\nNothing to do.', LS)).toBe('It tried to run “ls -la /workspace”.')
    expect(requestReason(null, { tools: [{ name: 'Bash' }] })).toBe(NO_REASON)
  })

  it("is cut to a card's line", () => {
    const long = requestReason(`I need approval ${'y'.repeat(APPROVAL_REASON_MAX_CHARS * 2)}`, LS)
    expect(long).toHaveLength(APPROVAL_REASON_MAX_CHARS)
    expect(long.endsWith('…')).toBe(true)
  })

  it("puts the approver's note before the continue message", () => {
    expect(continueAfterApprovalText(null, 'Please continue.')).toBe('Please continue.')
    expect(continueAfterApprovalText('only on staging', 'Please continue.')).toBe('[A person approved your request. Their note: only on staging.]\n\nPlease continue.')
  })
})

const run = (over: Partial<RunRow>): RunRow => ({ id: 'r1', status: 'COMPLETED', error: null, manifestStatus: null, pendingManifest: null, ...over }) as RunRow

describe("the frame a run's row stands for @SC-964", () => {
  it('is running while the run waits or runs', () => {
    expect(frameOfRun(run({ status: 'PENDING' }))).toMatchObject({ status: 'RUNNING', manifestPending: null })
    expect(frameOfRun(run({ status: 'RUNNING' }))).toMatchObject({ status: 'RUNNING' })
  })

  it('is its end, with its error, or with the request it ended on', () => {
    expect(frameOfRun(run({ status: 'FAILED', error: 'boom' }))).toEqual({ runId: 'r1', status: 'FAILED', error: 'boom', manifestPending: null })
    const asked = frameOfRun(run({ status: 'COMPLETED', manifestStatus: 'PENDING_APPROVAL', pendingManifest: { tools: [], bashPatterns: [] } }))
    expect(asked.manifestPending).toEqual({ runId: 'r1', summary: null, pendingManifest: { tools: [], bashPatterns: [] } })
    expect(frameOfRun(run({ status: 'COMPLETED', manifestStatus: 'APPROVED' })).manifestPending).toBeNull()
  })
})
