/**
 * The cards (workers and results spec, Results): what a RESULT card says of an ended operation, the one line a
 * notification carries when no reply can present it, and how the lead reads cards and its turn block.
 */
import { describe, it, expect } from 'vitest'
import { RESULT_TOO_LARGE, type ConversationMessageView } from '../../../shared/conversations/protocol'
import { APPROVAL_REASON_MAX, answerForLead, approvalForLead, approvalLine, cardLine, firstLine, resultBodyOf, resultForLead, resultLine, wasCapped } from '../cards'
import { leadMessages, withTurnBlock } from '../context'

function m(seq: number, role: 'PERSON' | 'AGENT' | 'PLATFORM', kind: string, body: unknown, extra: Partial<ConversationMessageView> = {}): ConversationMessageView {
  return {
    id: `m${seq}`, seq, clientMessageId: null, role, authorId: null, agentId: null, kind, body, spoken: false,
    interrupted: false, operationId: null, turnId: 't', queueState: null, createdAt: '', ...extra,
  } as ConversationMessageView
}

describe('resultBodyOf @SC-962', () => {
  it('carries a completed run\'s summary, whether it stated it, the task and its state after', () => {
    const body = resultBodyOf({
      title: 'Review the README', state: 'COMPLETED', error: null, boundaryName: 'Shop',
      result: { summary: 'Found 3 issues', stated: false, taskState: 'Release' }, task: { id: 't1', key: 'SHOP-2' },
    })
    expect(body).toEqual({
      title: 'Review the README', summary: 'Found 3 issues', outcome: 'completed', boundaryName: 'Shop', stated: false,
      taskState: 'Release', taskId: 't1', taskKey: 'SHOP-2',
    })
  })

  it('says why for a failure, and something for an end that left nothing to say', () => {
    expect(resultBodyOf({ title: 'T', state: 'FAILED', error: 'The site is offline', result: null })).toMatchObject({ outcome: 'failed', summary: 'The site is offline' })
    expect(resultBodyOf({ title: 'T', state: 'CANCELLED', error: null, result: null })).toMatchObject({ outcome: 'cancelled', summary: 'Stopped.' })
  })
})

describe('the lines a notification carries @SC-962', () => {
  it('takes the first line said, clipped', () => {
    expect(firstLine('\n  Three things are back.\nMore')).toBe('Three things are back.')
    expect(firstLine('x'.repeat(400))!.length).toBe(300)
    expect(firstLine('  ')).toBeNull()
  })

  it('writes a result\'s own line, and an approval request\'s', () => {
    expect(resultLine({ title: 'Review the README', summary: 'Found 3 issues\nfirst…', outcome: 'completed' })).toBe('Review the README · Found 3 issues')
    expect(resultLine({ title: 'Benchmark', summary: 'The site is offline', outcome: 'failed' })).toBe('Benchmark · Failed: The site is offline')
    expect(approvalLine({ title: 'Profile', reason: 'to measure', askedBy: 'Developer', what: 'Run the benchmark' })).toBe('Developer asks to run the benchmark')
  })

  it("makes an approval's reason one plain line, cut short", () => {
    expect(cardLine('## Why\n\nI need **`ls`** to see the hidden files.')).toBe('Why I need ls to see the hidden files.')
    expect(cardLine('z'.repeat(APPROVAL_REASON_MAX * 2))).toHaveLength(APPROVAL_REASON_MAX)
  })

  it('knows a capped result', () => {
    expect(wasCapped({ title: 'T', summary: `abc\n[${RESULT_TOO_LARGE}]`, outcome: 'completed' })).toBe(true)
  })
})

/** Words that would split the agent from its own background work (finding: one identity). */
const SPLIT = /came back|worker|helper|the job|the run\b|passed|handed|asks for approval/i

describe('what the agent is told of its own background work @SC-962', () => {
  it('reads a result as its own work, finished, failed or stopped, where it was', () => {
    const done = resultForLead({ title: 'Survey the space', summary: 'It is empty.', outcome: 'completed', boundaryName: 'Walkthrough' })
    expect(done).toBe('[Your work in Walkthrough finished: "Survey the space"]\nIt is empty.')
    expect(resultForLead({ title: 'T', summary: 'No model', outcome: 'failed' })).toMatch(/^\[Your work failed: "T"\]/)
    expect(resultForLead({ title: 'T', summary: 'Stopped.', outcome: 'cancelled' })).toMatch(/^\[Your work was stopped: "T"\]/)
    expect(done).not.toMatch(SPLIT)
  })

  it('says when it stated no result, and the task\'s column after', () => {
    const text = resultForLead({ title: 'T', summary: 'last words', outcome: 'completed', stated: false, taskKey: 'SHOP-2', taskState: 'Release' })
    expect(text).toContain('(You stated no result there; this is the last thing you said.)')
    expect(text).toContain('SHOP-2 is now in Release.')
    expect(text).not.toMatch(SPLIT)
  })

  it('reads its own approval request as its work needing the person\'s okay, with why', () => {
    const text = approvalForLead({ title: 'Survey the space', reason: 'I need to see the hidden files', askedBy: 'Kernel', what: 'Run the command `ls`', boundaryName: 'Walkthrough' }, 'Kernel')
    expect(text).toBe('[Your work in Walkthrough on "Survey the space" needs the person\'s okay to run the command `ls`, because: I need to see the hidden files. They answer it on its card; say nothing about it unless they ask.]')
    expect(text).not.toMatch(SPLIT)
  })

  it('names another agent whose work it is: a task assigned to them', () => {
    const text = approvalForLead({ title: 'Profile', reason: 'to measure', askedBy: 'Developer', what: 'Run the benchmark' }, 'Kernel')
    expect(text).toBe('[Developer\'s work on "Profile", which you started, needs the person\'s okay to run the benchmark, because: to measure. They answer it on its card; say nothing about it unless they ask.]')
  })

  it('reads the person\'s answer as theirs, to its own request', () => {
    expect(answerForLead({ answer: 'approve' })).toBe('[The person answered your request: approved; the work goes on now]')
    expect(answerForLead({ answer: 'decline', note: 'Not now' })).toBe('[The person answered your request: declined]\nTheir note: Not now')
  })
})

describe('the lead\'s context in a turn that answers no person @SC-962', () => {
  const history = [
    m(1, 'PERSON', 'TEXT', { text: 'check the README' }),
    m(2, 'AGENT', 'TEXT', { text: 'Started.' }),
    m(3, 'PLATFORM', 'RESULT', { title: 'Review the README', summary: 'Found 3 issues', outcome: 'completed' }, { operationId: 'op1', turnId: null }),
    m(4, 'PLATFORM', 'APPROVAL_REQUEST', { title: 'Profile', reason: 'to measure', askedBy: 'Developer' }, { operationId: 'op2', turnId: null }),
  ]

  it('reads the cards as hq\'s words, and leaves out a card awaiting another turn', () => {
    const { messages } = leadMessages(history, ['m1'], new Set(['m3', 'm4']))
    expect(messages).toEqual([{ role: 'user', content: 'check the README' }])
    const report = leadMessages(history, ['m3', 'm4'], new Set(['m3', 'm4']), 'Kernel').messages
    expect(report.at(-1)!.role).toBe('user')
    expect((report.at(-1) as { content: string }).content).toMatch(/\[Your work finished: "Review the README"\]\nFound 3 issues/)
    expect((report.at(-1) as { content: string }).content).toMatch(/\[Developer's work on "Profile", which you started, needs the person's okay to go on, because: to measure\. They answer it on its card/)
  })

  it('appends the report block — speech only — after the cards', () => {
    const { messages } = leadMessages(history, ['m3', 'm4'])
    const out = withTurnBlock(messages, history, { trigger: 'REPORT', inputIds: ['m3', 'm4'] })
    const last = (out.at(-1) as { content: string }).content
    expect(last).toMatch(/no tools and start no work/)
    expect(out).toHaveLength(messages.length)
  })

  it('appends the continuation\'s next step, named by the work it follows', () => {
    const { messages } = leadMessages(history, ['m3'])
    const out = withTurnBlock(messages, history, { trigger: 'CONTINUATION', inputIds: ['m3'], continuations: [{ operationId: 'op1', nextStep: 'open a task for each' }] })
    expect((out.at(-1) as { content: string }).content).toMatch(/After "Review the README": open a task for each/)
  })

  it('leaves a person\'s turn as it is', () => {
    const { messages } = leadMessages(history, ['m1'])
    expect(withTurnBlock(messages, history, { trigger: 'MESSAGE', inputIds: ['m1'] })).toBe(messages)
  })
})
