// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'

vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => null }))
vi.mock('../../../shared/components/MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <p>{content}</p> }))

vi.mock('wasp/client/operations', () => ({ useQuery: () => ({ data: undefined }), getUserSettings: 'getUserSettings' }))

import { MessageItem } from '../MessageItem'
import { thinkingLabel } from '../ThinkingPill'
import { ThreadMessages } from '../ThreadMessages'
import { TurnBlockView } from '../TurnBlock'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const agent = { id: 'a1', name: 'Kernel', handle: 'kernel', avatarUrl: null }
const steps = [
  { label: "Couldn't run WAL-2: nothing has that name", ms: 2_300, failed: true },
  { label: "Looked at your projects and Walkthrough's tasks", ms: 2_100 },
  { label: 'Started "Write a one-line welcome"', ms: 2_000, made: 'started' as const },
]

function reply(body: Record<string, unknown>): ConversationMessageView {
  return {
    id: 'm1', seq: 1, clientMessageId: null, role: 'AGENT', authorId: null, agentId: 'a1', kind: 'TEXT',
    body, spoken: false, interrupted: false, operationId: null, turnId: 't1', queueState: null,
    createdAt: '2026-10-16T11:15:00.000Z',
  } as ConversationMessageView
}

function thread(props: Partial<Parameters<typeof ThreadMessages>[0]>) {
  return render(
    <ThreadMessages
      messages={[]} waiting={[]} stream={null} running agent={agent} hasMore={false} loadingOlder={false}
      onLoadOlder={() => {}} busy={false} onSendNow={() => {}} onCancel={() => {}} {...props}
    />,
  )
}

describe('the toggle on a written reply @SC-1005', () => {
  it('says how long it thought, in the name line, and nothing more, with its steps folded', () => {
    render(<MessageItem message={reply({ text: 'Started it again.', thinking: { ms: 7_200, steps } })} agent={agent} />)
    expect(screen.getByTestId('thinking-pill').textContent).toBe('Thought for 7 s›')
    expect(screen.getByTestId('thinking-pill').getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByTestId('thinking-steps')).toBeNull()
  })

  it('opens one list of steps in plain words, with a mark for each and no times, and folds them again', () => {
    render(<MessageItem message={reply({ text: 'Started it again.', thinking: { ms: 7_200, steps } })} agent={agent} />)
    fireEvent.click(screen.getByTestId('thinking-pill'))
    const lines = screen.getByTestId('thinking-steps').querySelectorAll('li')
    expect(lines).toHaveLength(3)
    expect(lines[0]!.textContent).toBe("!Didn't work: Couldn't run WAL-2: nothing has that name")
    expect(lines[1]!.textContent).toBe("✓Done: Looked at your projects and Walkthrough's tasks")
    expect(lines[2]!.textContent).toBe('✓Done: Started "Write a one-line welcome"')
    fireEvent.click(screen.getByTestId('thinking-pill'))
    expect(screen.queryByTestId('thinking-steps')).toBeNull()
  })

  it('is not there for a plain answer', () => {
    render(<MessageItem message={reply({ text: 'Hi.' })} agent={agent} />)
    expect(screen.queryByTestId('thinking-pill')).toBeNull()
  })

  it('is kept on a reply that failed', () => {
    render(<MessageItem message={{ ...reply({}), kind: 'FAILED', body: { reason: 'The model is busy.', thinking: { ms: 3_000, steps: steps.slice(0, 1) } } } as ConversationMessageView} agent={agent} />)
    expect(screen.getByTestId('thinking-pill').textContent).toContain('Thought for 3 s')
  })
})

describe('the toggle while a reply works @SC-1005', () => {
  it('says only Thinking, its steps live as they run', () => {
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
    const live = { turnId: 't1', since: 94_000, steps: [{ label: 'Looking at your projects' }] }
    thread({ turnId: 't1', turnSince: 97_000, steps: live })
    expect(screen.getByTestId('thinking-pill').textContent).toBe('Thinking›')
    act(() => { vi.advanceTimersByTime(2_000) })
    expect(screen.getByTestId('thinking-pill').textContent).toBe('Thinking›')
    fireEvent.click(screen.getByTestId('thinking-pill'))
    expect(screen.getByTestId('thinking-steps').textContent).toBe('…Working: Looking at your projects')
  })

  it('stays in the name line while the reply streams its words', () => {
    thread({ stream: { turnId: 't1', text: 'Here is what I found' }, steps: { turnId: 't1', since: 90_000, steps: [{ label: 'Looked at your projects', ms: 2_000 }] } })
    expect(screen.getByTestId('streaming-reply').textContent).toContain('Here is what I found')
    expect(screen.getByTestId('thinking-pill').textContent).toBe('Thinking›')
  })
})

describe("the toggle's words @SC-1005", () => {
  const made = [
    { label: 'Looked at your places', ms: 1_000 },
    { label: 'Started "List every file in my space"', ms: 2_000, made: 'started' as const },
  ]

  it('say how long it thought once it has ended, nothing more', () => {
    expect(thinkingLabel({ ms: 6_000, steps: made })).toBe('Thought for 6 s')
    expect(thinkingLabel({ ms: 9_000, steps: [{ label: 'Set WAL-4', made: 'set' }] })).toBe('Thought for 9 s')
    expect(thinkingLabel({ ms: 300, steps: [] })).toBe('Thought for 1 s')
  })

  it('say Thinking while it runs', () => {
    expect(thinkingLabel({ since: 0, steps: made })).toBe('Thinking')
  })
})

describe('under an answer @SC-1008', () => {
  it('offers Copy as an icon, named for a screen reader, once its turn has ended, and copies the words', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText: write } })
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
    render(<MessageItem message={reply({ text: 'The dark blue one.' })} agent={agent} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(write).toHaveBeenCalledWith('The dark blue one.')
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy()
    expect(screen.getByTestId('reply-actions').textContent).toBe('')
  })

  it('offers nothing under a reply with no words', () => {
    render(<MessageItem message={reply({ text: '  ', thinking: { ms: 1_000, steps: [] } })} agent={agent} />)
    expect(screen.queryByTestId('reply-actions')).toBeNull()
  })

  it('opens the steps from ⋯ Show the run', () => {
    render(<MessageItem message={reply({ text: 'Started it again.', thinking: { ms: 7_200, steps } })} agent={agent} />)
    fireEvent.click(screen.getByRole('button', { name: 'More about this answer' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Show the run/ }))
    expect(screen.getByTestId('thinking-steps')).toBeTruthy()
    expect(screen.getByTestId('thinking-pill').getAttribute('aria-expanded')).toBe('true')
  })

  it('has no ⋯ under an answer that took no steps and has no record to show', () => {
    render(<MessageItem message={reply({ text: 'Hi.' })} agent={agent} />)
    expect(screen.queryByRole('button', { name: 'More about this answer' })).toBeNull()
  })
})

describe('an answer the person stopped', () => {
  type Words = Extract<ConversationMessageView, { kind: 'TEXT' }>
  const stopped = (text: string, thinking?: unknown) => ({ ...reply({ text, ...(thinking ? { thinking } : {}) }), interrupted: true }) as Words

  it('says the person stopped it here, after how long', () => {
    render(<MessageItem message={stopped('1. The Contact us link', { ms: 26_000, steps })} agent={agent} />)
    expect(screen.getByTestId('stopped-here').textContent).toBe('You stopped it here, after 26 s.')
    cleanup()
    render(<MessageItem message={stopped('1. The Contact us link')} agent={agent} />)
    expect(screen.getByTestId('stopped-here').textContent).toBe('You stopped it here.')
  })

  it('offers Try again, which asks for the turn to be sent again', () => {
    const again = vi.fn()
    render(<TurnBlockView block={{ cards: [], words: [stopped('Half of it')], set: [] }} agent={agent} onTryAgain={again} />)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(again).toHaveBeenCalledWith('t1')
  })

  it('offers Try again alone when it was stopped before it said anything', () => {
    render(<TurnBlockView block={{ cards: [], words: [stopped('')], set: [] }} agent={agent} onTryAgain={() => {}} />)
    expect(screen.getByTestId('stopped-here').textContent).toBe('You stopped it before it answered.')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
  })

  it('has no Try again where nothing can send the turn again', () => {
    render(<MessageItem message={stopped('Half of it')} agent={agent} />)
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })
})
