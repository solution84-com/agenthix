// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'
import type { WorkContext } from '../WorkContext'

const h = vi.hoisted(() => ({ result: { data: undefined as unknown, error: null as unknown, isLoading: false } }))
vi.mock('wasp/client/operations', () => ({ getOperationResult: 'getOperationResult', getAnswerFacts: 'getAnswerFacts', speakAnswer: vi.fn(), useQuery: () => h.result }))
vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => null }))
vi.mock('../../../shared/components/MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <p>{content}</p> }))

import { MessageItem } from '../MessageItem'
import { startsWords } from '../ScheduledCard'
import { ThreadMessages } from '../ThreadMessages'

const agent = { id: 'a1', name: 'Kernel', handle: 'kernel', avatarUrl: null }
function msg(seq: number, kind: string, body: unknown, over: Record<string, unknown> = {}): ConversationMessageView {
  return {
    id: `m${seq}`, seq, clientMessageId: null, role: 'PLATFORM', authorId: null, agentId: 'a1', kind, body, spoken: false,
    interrupted: false, operationId: 'o1', turnId: 't1', queueState: null, createdAt: '2026-10-16T10:24:00.000Z', ...over,
  } as ConversationMessageView
}

function context(over: Partial<WorkContext> = {}): WorkContext {
  return { conversationId: 'c1', myId: 'u1', ...over }
}

beforeEach(() => {
  h.result = { data: undefined, error: null, isLoading: false }
})
afterEach(cleanup)

function thread(messages: ConversationMessageView[], work: WorkContext) {
  return render(
    <ThreadMessages
      messages={messages} waiting={[]} stream={null} running={false} agent={agent} hasMore={false} loadingOlder={false}
      onLoadOlder={() => {}} busy={false} onSendNow={() => {}} onCancel={() => {}} work={work}
    />,
  )
}

describe('work started @SC-1004', () => {
  const started = msg(1, 'OPERATION_STARTED', { title: 'Profile the image pipeline', boundaryName: 'Shop' }, { role: 'AGENT' })

  it('has no card in the thread: the work bar has it', () => {
    const { container } = render(<MessageItem message={started} agent={agent} work={context()} />)
    expect(container.textContent).toBe('')
    cleanup()
    thread([started], context())
    expect(screen.queryByTestId('agent-block')).toBeNull()
  })
})

describe('a task set for a time @SC-1004', () => {
  const at = '2026-10-17T22:00:00.000Z'
  const started = msg(1, 'OPERATION_STARTED', { title: 'WAL-4 Morning check', boundaryName: 'Walkthrough', startsAt: at }, { role: 'AGENT', operationId: 'o4' })
  const words = msg(2, 'TEXT', { text: "I've set Morning check to start tomorrow at 9:00." }, { role: 'AGENT', operationId: null })

  it('is a still card in its turn\'s block, after the words: when it starts, no spinner, no Stop', () => {
    // From its message alone: no live row is read, so the card stays once the task has run.
    thread([started, words], context())
    expect(screen.getAllByTestId('agent-block')).toHaveLength(1)
    const card = screen.getByTestId('scheduled-card')
    expect(card.textContent).toContain('WAL-4 Morning check')
    expect(card.textContent).toContain('Walkthrough')
    expect(card.textContent).toContain(`starts ${startsWords(at)}`)
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
    expect(card.querySelector('.animate-spin, [class*="animate-spin"]')).toBeNull()
    const block = screen.getByTestId('agent-block')
    expect(block.textContent!.indexOf("I've set")).toBeLessThan(block.textContent!.indexOf('WAL-4 Morning check'))
  })

  it('reads its start as the day, the date and the time', () => {
    expect(startsWords(at, 'Australia/Sydney')).toBe('Sun 18 Oct, 9:00')
  })
})

describe('a card and the reply to it @SC-1004', () => {
  it('are one block under one name line', () => {
    const card = msg(1, 'RESULT', { title: 'List my space', outcome: 'completed', summary: 'Nothing there' }, { turnId: 't2' })
    const reply = msg(2, 'TEXT', { text: 'Your space is empty.' }, { role: 'AGENT', operationId: null, turnId: 't2' })
    thread([card, reply], context())
    const blocks = screen.getAllByTestId('agent-block')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.textContent).toContain('Finished: List my space')
    expect(blocks[0]!.textContent).toContain('Your space is empty.')
    expect(screen.getAllByText('Kernel')).toHaveLength(1)
  })
})

describe('the completion card @SC-1006', () => {
  const done = msg(2, 'RESULT', { title: 'Profile the image pipeline', outcome: 'completed', summary: 'Resizing takes 40ms\nmore detail', boundaryName: 'Shop' })

  it('gives the title and the one-line result, and View results', () => {
    render(<MessageItem message={done} agent={agent} work={context()} />)
    const card = screen.getByTestId('result-card')
    expect(card.textContent).toContain('Profile the image pipeline')
    expect(card.textContent).toContain('Resizing takes 40ms')
    expect(card.textContent).not.toContain('more detail')
    expect(screen.getByRole('button', { name: 'View results' })).toBeTruthy()
  })

  it('fetches the result and the run\'s work only when opened', () => {
    h.result = { data: { title: 't', state: 'COMPLETED', summary: 'Resizing takes 40ms\nmore detail', stated: true, work: { summary: 'Read 3 files', steps: [{ text: 'Read a.ts' }] }, runUrl: '/runs/r1?session=s1', problem: null }, error: null, isLoading: false }
    render(<MessageItem message={done} agent={agent} work={context()} />)
    expect(screen.queryByTestId('result-detail')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'View results' }))
    const detail = screen.getByTestId('result-detail')
    expect(detail.textContent).toContain('more detail')
    expect(detail.textContent).toContain('Read a.ts')
    expect(screen.getByRole('link', { name: 'Open the full record' }).getAttribute('href')).toBe('/runs/r1?session=s1')
  })

  it('says plainly when the run\'s work could not be fetched', () => {
    h.result = { data: { title: 't', state: 'COMPLETED', summary: 'Done', stated: true, work: null, runUrl: null, problem: 'The place this ran is not reachable now.' }, error: null, isLoading: false }
    render(<MessageItem message={done} agent={agent} work={context()} />)
    fireEvent.click(screen.getByRole('button', { name: 'View results' }))
    expect(screen.getByTestId('result-detail').textContent).toContain('not reachable now')
  })

  it('says when the run did not state its result', () => {
    h.result = { data: { title: 't', state: 'COMPLETED', summary: 'Last words', stated: false, work: null, runUrl: null, problem: null }, error: null, isLoading: false }
    render(<MessageItem message={done} agent={agent} work={context()} />)
    fireEvent.click(screen.getByRole('button', { name: 'View results' }))
    expect(screen.getByTestId('result-detail').textContent).toContain('did not state a result')
  })

  it('shows a failure with its reason', () => {
    const failed = msg(3, 'RESULT', { title: 'Profile it', outcome: 'failed', summary: 'The site went away mid-run' })
    render(<MessageItem message={failed} agent={agent} work={context()} />)
    expect(screen.getByTestId('result-card').textContent).toContain('Did not finish')
    expect(screen.getByTestId('result-card').textContent).toContain('The site went away mid-run')
  })

  it('shows work that was stopped as stopped', () => {
    const stopped = msg(3, 'RESULT', { title: 'Profile it', outcome: 'cancelled', summary: '' })
    render(<MessageItem message={stopped} agent={agent} work={context()} />)
    expect(screen.getByTestId('result-card').textContent).toContain('Stopped')
  })
})

describe('a reply stopped before it said anything (walkthrough finding 39) @SC-1004', () => {
  it('says under the agent\'s name, in its own block, that the person stopped it, with no Copy', () => {
    const stopped = msg(1, 'TEXT', { text: '' }, { role: 'AGENT', operationId: null, interrupted: true })
    thread([stopped], context())
    const block = screen.getByTestId('agent-block')
    expect(block.textContent).toContain('Kernel')
    expect(block.textContent).toContain('You stopped it before it answered.')
    expect(screen.queryByRole('button', { name: /Copy/ })).toBeNull()
  })
})

