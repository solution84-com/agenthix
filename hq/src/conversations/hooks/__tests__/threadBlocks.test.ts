import { describe, expect, it } from 'vitest'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'
import { copyText, threadItems, wordsOf, type ThreadItem } from '../threadBlocks'

let seq = 0
function msg(kind: string, body: unknown, over: Partial<ConversationMessageView> = {}): ConversationMessageView {
  seq++
  return {
    id: `m${seq}`, seq, clientMessageId: null, role: 'AGENT', authorId: null, agentId: 'a1', kind, body, spoken: false,
    interrupted: false, operationId: null, turnId: null, queueState: null, createdAt: '2026-10-17T10:00:00.000Z', ...over,
  } as ConversationMessageView
}
const ask = (text: string, turnId: string | null = null) => msg('TEXT', { text }, { role: 'PERSON', agentId: null, authorId: 'u1', turnId })
const words = (text: string, turnId: string) => msg('TEXT', { text }, { turnId })
const result = (title: string, turnId: string | null, operationId = `op-${title}`) =>
  msg('RESULT', { title, summary: '', outcome: 'completed' }, { role: 'PLATFORM', agentId: null, turnId, operationId })
const started = (title: string, turnId: string, operationId: string, startsAt?: string) =>
  msg('OPERATION_STARTED', { title, ...(startsAt ? { startsAt } : {}) }, { turnId, operationId })

const noneSet = { liveTurnId: null }
const shape = (items: ThreadItem[]) => items.map((i) => (i.kind === 'message'
  ? i.message.kind === 'TEXT' ? `msg:${i.message.body.text}` : `msg:${i.message.kind}`
  : i.kind === 'run' ? `run:${i.card.workflow}`
  : `turn:[${i.cards.map((c) => c.body.title).join(',')}|${i.words.map((w) => (w.kind === 'TEXT' ? w.body.text : 'FAILED')).join(',')}|${i.set.map((s) => s.body.title).join(',')}]`))

describe('the thread in blocks @SC-1004', () => {
  it('draws a completion card at the head of the reply that answers it, in one block', () => {
    const items = threadItems([ask('List my space', 't1'), words('Listing it now.', 't1'), result('List my space', 't2'), words('Your space is empty.', 't2')], noneSet).items
    expect(shape(items)).toEqual(['msg:List my space', 'turn:[|Listing it now.|]', 'turn:[List my space|Your space is empty.|]'])
  })

  it('puts the block where its words are, after what the person wrote while the card waited', () => {
    const items = threadItems([result('Review chapter 1', 't2'), ask('And the cover?', 't2'), words('Chapter 1 reads well; the cover is blue.', 't2')], noneSet).items
    expect(shape(items)).toEqual(['msg:And the cover?', 'turn:[Review chapter 1|Chapter 1 reads well; the cover is blue.|]'])
  })

  it('keeps a card no turn answered as a block of its own, where it arrived', () => {
    const items = threadItems([ask('Stop that', 't1'), result('Profile it', null), words('Stopped.', 't1')], noneSet).items
    expect(shape(items)).toEqual(['msg:Stop that', 'turn:[Profile it||]', 'turn:[|Stopped.|]'])
  })

  it('keeps each turn its own block', () => {
    const items = threadItems([words('First.', 't1'), words('Second.', 't2')], noneSet).items
    expect(items).toHaveLength(2)
  })

  it('leaves started work, requests and the answers to them out of the thread', () => {
    const items = threadItems([
      ask('List my space', 't1'), started('List every file', 't1', 'o1'), words("I've started: List every file.", 't1'),
      msg('APPROVAL_REQUEST', { title: 'x', reason: 'y', askedBy: 'Kernel' }, { role: 'PLATFORM', operationId: 'o1' }),
      msg('APPROVAL_ANSWER', { answer: 'approve' }, { role: 'PERSON', operationId: 'o1' }),
    ], noneSet).items
    expect(shape(items)).toEqual(['msg:List my space', "turn:[|I've started: List every file.|]"])
  })

  it('puts a task set for a time in its turn\'s block, after the words, from what its message holds', () => {
    const items = threadItems(
      [ask('Morning check at 9', 't1'), started('WAL-4 Morning check', 't1', 'o4', '2026-10-17T22:00:00.000Z'), words("I've set it.", 't1')],
      noneSet,
    ).items
    expect(shape(items)).toEqual(['msg:Morning check at 9', "turn:[|I've set it.|WAL-4 Morning check]"])
  })

  it('holds the running turn apart, with the cards it is answering, to draw it last', () => {
    const { items, live } = threadItems([words('Earlier.', 't1'), result('List my space', 't2')], { liveTurnId: 't2' })
    expect(shape(items)).toEqual(['turn:[|Earlier.|]'])
    expect(live?.cards.map((c) => c.body.title)).toEqual(['List my space'])
  })

  it('gives a running turn with nothing written yet an empty block, and none when no turn runs', () => {
    expect(threadItems([], { liveTurnId: 't9' }).live).toMatchObject({ turnId: 't9', cards: [], words: [], set: [] })
    expect(threadItems([], noneSet).live).toBeNull()
  })

  it('leaves out a reply withdrawn unheard because the person\'s words joined their message; keeps a stopped one', () => {
    const withdrawn = msg('TEXT', { text: '' }, { turnId: 't1', interrupted: true, withdrawn: true })
    const stopped = msg('TEXT', { text: '' }, { turnId: 't2', interrupted: true })
    const items = threadItems([ask('what about the build and the tests', 't1'), withdrawn, ask('next', 't2'), stopped], noneSet).items
    expect(shape(items)).toEqual(['msg:what about the build and the tests', 'msg:next', 'turn:[||]'])
  })

  it('leaves out an encouragement response once the person\'s words joined their message, and shows it until then', () => {
    const prompt = (withdrawn: boolean) => msg('TEXT', { text: 'Mm? Go on.' }, { turnId: 't1', encouragement: true, withdrawn })
    expect(shape(threadItems([ask('I think we should move the launch', null), prompt(true)], noneSet).items)).toEqual(['msg:I think we should move the launch'])
    expect(shape(threadItems([ask('I think we', 't1'), prompt(false)], noneSet).items)).toEqual(['msg:I think we', 'turn:[|Mm? Go on.|]'])
  })

  it('keeps every other kind of message where it is', () => {
    const items = threadItems([msg('NOTICE', { text: 'Switched' }, { role: 'PLATFORM' }), msg('ACTION', { text: 'Created WAL-4', toolName: 'create_task' }, { turnId: 't1' })], noneSet).items
    expect(shape(items)).toEqual(['msg:NOTICE', 'msg:ACTION'])
  })

  it('puts a finished workflow run where it ended, and leaves one under way to the work bar', () => {
    const at = (t: string) => ({ createdAt: `2026-10-17T${t}.000Z` })
    const card = (workflow: string, endedAt: string | null) => ({
      runId: workflow, workflowId: 'w1', workflow, state: endedAt ? 'passed' as const : 'running' as const, stepNumber: null, stepCount: 1,
      stepName: null, failedStep: null, lastLine: null, durationMs: 2000, endedAt: endedAt ? new Date(`2026-10-17T${endedAt}.000Z`) : null, href: '/r',
    })
    const items = threadItems(
      [ask('Push it', 't1'), { ...words('Pushing.', 't1'), ...at('10:01:00') }, { ...ask('Thanks', 't2'), ...at('10:05:00') }],
      { liveTurnId: null, runs: [card('push', '10:02:00'), card('deploy', null)] },
    ).items
    expect(shape(items)).toEqual(['msg:Push it', 'turn:[|Pushing.|]', 'run:push', 'msg:Thanks'])
  })

  it('keeps runs that ended between the same two messages in the order they ended', () => {
    const card = (workflow: string, endedAt: string) => ({
      runId: workflow, workflowId: 'w1', workflow, state: 'passed' as const, stepNumber: null, stepCount: 1, stepName: null,
      failedStep: null, lastLine: null, durationMs: 2000, endedAt: new Date(`2026-10-17T${endedAt}.000Z`), href: '/r',
    })
    const items = threadItems([ask('Push and open a pull request', 't1')], { liveTurnId: null, runs: [card('open-pull-request', '10:00:09'), card('push', '10:00:05')] }).items
    expect(shape(items)).toEqual(['msg:Push and open a pull request', 'run:push', 'run:open-pull-request'])
  })
})

describe('what Copy takes @SC-1008', () => {
  it('is the words, with a shown part\'s body and none of its markers', () => {
    const text = 'Here it is.\n:::shown The plan\n> I put the plan in the thread.\n1. Read\n2. Write\n:::\nThat is all.'
    expect(copyText([text])).toBe('Here it is.\n\n1. Read\n2. Write\n\nThat is all.')
  })

  it('joins a block\'s replies, and what a failed one wrote', () => {
    const block = { words: [words('One.', 't1') as never, msg('FAILED', { reason: 'busy', partialText: 'Two' }, { turnId: 't1' }) as never] }
    expect(copyText(wordsOf(block))).toBe('One.\n\nTwo')
  })
})
