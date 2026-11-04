import { describe, it, expect } from 'vitest'
import { orderTranscript, latestFailure, isWaitingMessage, replyCounts } from '../conversationOrder.js'
import { plainFailureReason, UNKNOWN_FAILURE_REASON } from '../runFailureReason.js'
import { contextShare, parseContextUse } from '../contextUse.js'
import { approvalItems, approvalAnswer, approvalItemsLine } from '../approvalWording.js'
import { TRANSCRIPT_ENTRY_KINDS, type TranscriptRow } from '../transcript.js'

const at = (m: number, s = 0) => new Date(Date.UTC(2026, 9, 10, 10, m, s)).toISOString()
type Row = Pick<TranscriptRow, 'role' | 'content' | 'createdAt'> & Partial<TranscriptRow>
const row = (r: Row): Row => r

describe('the conversation record @SC-752 @SC-753', () => {
  it('records these kinds of system row', () => {
    expect(TRANSCRIPT_ENTRY_KINDS).toEqual(['THOUGHT', 'RUN_FAILED', 'RUN_STOPPED', 'APPROVAL_REQUESTED', 'CONTEXT_SUMMARISED'])
  })

  it('reads a message sent while a reply was written after that reply', () => {
    const rows = [
      row({ id: 'u1', role: 'USER', content: 'Run the tests.', runId: 'A', createdAt: at(40) }),
      row({ id: 't1', role: 'TOOL', content: 'Bash', runId: 'A', createdAt: at(40, 10) }),
      row({ id: 'u2', role: 'USER', content: 'Also the phone.', runId: 'B', createdAt: at(41) }),
      row({ id: 't2', role: 'TOOL', content: 'Bash', runId: 'A', createdAt: at(42) }),
      row({ id: 'r1', role: 'ASSISTANT', content: 'Three fail.', runId: 'A', createdAt: at(43) }),
      row({ id: 'r2', role: 'ASSISTANT', content: 'Phone too.', runId: 'B', createdAt: at(44) }),
    ]
    expect(orderTranscript(rows).map(r => r.id)).toEqual(['u1', 't1', 't2', 'r1', 'u2', 'r2'])
  })

  it('keeps a row with no run at its own time, and a failure after the reply it ended', () => {
    const rows = [
      row({ id: 'old', role: 'USER', content: 'hi', createdAt: at(1) }),
      row({ id: 'f', role: 'SYSTEM', kind: 'RUN_FAILED', content: '', runId: 'A', createdAt: at(5) }),
      row({ id: 'r', role: 'ASSISTANT', content: 'partial', runId: 'A', createdAt: at(5) }),
    ]
    expect(orderTranscript(rows).map(r => r.id)).toEqual(['old', 'r', 'f'])
  })

  it('offers Try again only while the latest reply is a failure', () => {
    const failed = [
      row({ role: 'USER', content: 'Summarise today.', runId: 'A', createdAt: at(30) }),
      row({ role: 'TOOL', content: 'Read', runId: 'A', createdAt: at(30, 5) }),
      row({ role: 'SYSTEM', kind: 'RUN_FAILED', content: '', detail: { reason: 'The site lost its connection to the model.' }, runId: 'A', createdAt: at(31) }),
    ]
    expect(latestFailure(failed)).toEqual({ runId: 'A', reason: 'The site lost its connection to the model.', message: 'Summarise today.' })
    expect(latestFailure([...failed, row({ role: 'USER', content: 'Hello?', runId: 'B', createdAt: at(32) })])).toBeNull()
    expect(latestFailure([...failed, row({ role: 'ASSISTANT', content: 'Done.', runId: 'C', createdAt: at(33) })])).toBeNull()
    expect(latestFailure([...failed, row({ role: 'SYSTEM', kind: 'CONTEXT_SUMMARISED', content: '', createdAt: at(33) })])).not.toBeNull()
  })

  it('knows a message still waiting behind a reply', () => {
    expect(isWaitingMessage({ role: 'USER', runStatus: 'PENDING' })).toBe(true)
    expect(isWaitingMessage({ role: 'USER', runStatus: 'RUNNING' })).toBe(false)
  })

  it('counts replies and the failed ones', () => {
    expect(replyCounts([{ role: 'ASSISTANT' }, { role: 'SYSTEM', kind: 'RUN_FAILED' }, { role: 'USER' }, { role: 'SYSTEM', kind: 'THOUGHT' }]))
      .toEqual({ replies: 2, failed: 1 })
  })
})

describe('a failure in plain words @SC-754', () => {
  it('maps the raw errors the runtimes write', () => {
    expect(plainFailureReason('The model provider answered 529: overloaded_error')).toBe('The model provider was overloaded.')
    expect(plainFailureReason('fetch failed: ECONNRESET')).toBe('The site lost its connection to the model.')
    expect(plainFailureReason('The model provider answered 401: invalid x-api-key. Check that the credential for this provider is set up correctly.'))
      .toBe('The model provider refused the credential.')
    expect(plainFailureReason('Claude Code process ended during the turn: killed')).toBe("The agent's process stopped unexpectedly.")
    expect(plainFailureReason('ContextOverflowError: prompt is too long')).toBe("The agent's memory of this conversation was full.")
  })

  it('does not read an unrelated error as a provider failure', () => {
    expect(plainFailureReason('git: Authentication failed for https://github.com/acme/app.git')).toBe(UNKNOWN_FAILURE_REASON)
    expect(plainFailureReason('could not read 512 bytes from the file')).toBe(UNKNOWN_FAILURE_REASON)
    expect(plainFailureReason('Error response from daemon: network agent-net not found')).toBe(UNKNOWN_FAILURE_REASON)
    expect(plainFailureReason('missing credential file in the folder')).toBe(UNKNOWN_FAILURE_REASON)
    expect(plainFailureReason('The model provider answered 503: service unavailable')).toBe('The model provider had an error.')
    expect(plainFailureReason('status code 429')).toBe("The model provider's rate limit was reached.")
    expect(plainFailureReason('429 rate_limit_error')).toBe("The model provider's rate limit was reached.")
    expect(plainFailureReason('read failed after 512 bytes')).toBe(UNKNOWN_FAILURE_REASON)
  })

  it('keeps an error already written for a person', () => {
    const closed = 'This conversation was closed because its project was deleted.'
    expect(plainFailureReason(closed)).toBe(closed)
    expect(plainFailureReason('No model credential is configured for this project. Add an API key.')).toMatch(/^No model credential/)
  })

  it('never shows an unrecognised raw error', () => {
    expect(plainFailureReason('TypeError: cannot read properties of undefined')).toBe(UNKNOWN_FAILURE_REASON)
    expect(plainFailureReason(null)).toBe(UNKNOWN_FAILURE_REASON)
  })
})

describe('an approval request that is not shaped as expected @SC-754', () => {
  it('reads as what can be read, and never throws', () => {
    expect(approvalItems({ tools: 'web_fetch' })).toEqual([])
    expect(approvalItems({ tools: [null, 5, { name: 'web_fetch' }] })).toEqual([{ does: 'Fetch a web page', why: null, command: false }])
    expect(approvalItems({ bashPatterns: { pattern: 'ls' } })).toEqual([])
    expect(approvalItems({ bashPatterns: [undefined, { pattern: 'ls' }] })).toEqual([{ does: 'ls', why: null, command: true }])
    expect(approvalItems(null)).toEqual([])
  })
})

describe("the agent's memory @SC-755", () => {
  it('is a share of the window, coloured by how full it is', () => {
    const use = { tokens: 124_000, summarisesAt: 184_000, window: 200_000, at: at(40) }
    expect(contextShare(use)).toEqual({ percent: 62, level: 'room', summarisesAtPercent: 92 })
    expect(contextShare({ ...use, tokens: 156_000 }).level).toBe('filling')
    expect(contextShare({ ...use, tokens: 188_000 }).level).toBe('nearly_full')
  })

  it('reads back only a stored value that is one', () => {
    expect(parseContextUse({ tokens: 1, window: 10, at: at(1) })).toEqual({ tokens: 1, window: 10, summarisesAt: null, at: at(1) })
    expect(parseContextUse({ tokens: 'x', window: 10, at: at(1) })).toBeNull()
    expect(parseContextUse(null)).toBeNull()
  })
})

describe('an approval in plain words @SC-751', () => {
  const request = {
    tools: [{ name: 'web_fetch', reason: 'https://example.com/releases' }],
    bashPatterns: [{ pattern: 'npm install sdk@0.9.2' }],
  }

  it('shows a command as the whole command the approval grants, never a reason beside it', () => {
    expect(approvalItems({ bashPatterns: [{ pattern: 'cd x && npm install sdk@0.9.2', reason: 'npm install' }] })).toEqual([
      { does: 'cd x && npm install sdk@0.9.2', why: null, command: true },
    ])
  })

  it('says what each item will do, never the tool or the pattern', () => {
    expect(approvalItems(request)).toEqual([
      { does: 'Fetch a web page', why: 'https://example.com/releases', command: false },
      { does: 'npm install sdk@0.9.2', why: null, command: true },
    ])
  })

  it('folds to a short list', () => {
    const items = approvalItems({ ...request, tools: [...request.tools, { name: 'write_file' }, { name: 'web_search' }] })
    expect(approvalItemsLine(items)).toBe('fetch a web page, create and overwrite files +2')
  })

  it('reads the answer off the request state', () => {
    expect(approvalAnswer('PENDING_APPROVAL')).toBe('waiting')
    expect(approvalAnswer('APPROVED')).toBe('approved')
    expect(approvalAnswer('REJECTED')).toBe('denied')
    expect(approvalAnswer('SUPERSEDED')).toBe('not_answered')
  })
})
