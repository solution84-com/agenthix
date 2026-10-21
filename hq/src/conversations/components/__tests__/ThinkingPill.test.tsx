// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'

vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => null }))
vi.mock('../../../shared/components/MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <p>{content}</p> }))

import { MessageItem } from '../MessageItem'
import { thinkingLabel } from '../ThinkingPill'
import { ThreadMessages } from '../ThreadMessages'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const agent = { id: 'a1', name: 'Kernel', handle: 'kernel', avatarUrl: null }
const steps = [
  { label: 'Run WAL-2 — not found by that name', ms: 2_300, failed: true },
  { label: "Your projects and Walkthrough's tasks", ms: 2_100 },
  { label: 'Started "Write a one-line welcome"', ms: 2_000 },
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

describe('the thinking pill on a written reply @SC-1005', () => {
  it('says how long it thought, in the name line, with its steps closed', () => {
    render(<MessageItem message={reply({ text: 'Started it again.', thinking: { ms: 7_200, steps } })} agent={agent} />)
    expect(screen.getByTestId('thinking-pill').textContent).toContain('Thought for 7 s')
    expect(screen.getByTestId('thinking-pill').getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByTestId('thinking-steps')).toBeNull()
    expect(screen.queryByText(/steps?\b.*\d/)).toBeNull()
  })

  it('opens its steps on a click, one line each with its time, and closes them again', () => {
    render(<MessageItem message={reply({ text: 'Started it again.', thinking: { ms: 7_200, steps } })} agent={agent} />)
    fireEvent.click(screen.getByTestId('thinking-pill'))
    const lines = screen.getByTestId('thinking-steps').querySelectorAll('li')
    expect(lines).toHaveLength(3)
    expect(lines[0]!.textContent).toBe('✕Run WAL-2 — not found by that name · 2.3 s')
    expect(lines[1]!.textContent).toBe("✓Your projects and Walkthrough's tasks · 2.1 s")
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

describe('the thinking pill while a reply works @SC-1005', () => {
  it('counts up from when the turn began, with a pulsing dot, before and after the reply takes a step', () => {
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
    const { rerender } = thread({ turnId: 't1', turnSince: 97_000 })
    expect(screen.getByTestId('thinking-pill').textContent).toContain('Thinking · 3 s')
    expect(screen.getByTestId('thinking-dot').className).toContain('motion-safe:animate-pulse')

    const live = { turnId: 't1', since: 94_000, steps: [{ label: 'Your projects' }] }
    rerender(
      <ThreadMessages
        messages={[]} waiting={[]} stream={null} running turnId="t1" turnSince={97_000} steps={live} agent={agent} hasMore={false} loadingOlder={false}
        onLoadOlder={() => {}} busy={false} onSendNow={() => {}} onCancel={() => {}}
      />,
    )
    expect(screen.getByTestId('thinking-pill').textContent).toContain('Thinking · 6 s')
    act(() => { vi.advanceTimersByTime(2_000) })
    expect(screen.getByTestId('thinking-pill').textContent).toContain('Thinking · 8 s')

    fireEvent.click(screen.getByTestId('thinking-pill'))
    expect(screen.getByTestId('thinking-steps').textContent).toBe('…Your projects')
  })

  it('stays in the name line while the reply streams its words', () => {
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
    thread({ stream: { turnId: 't1', text: 'Here is what I found' }, steps: { turnId: 't1', since: 90_000, steps: [{ label: 'Your projects', ms: 2_000 }] } })
    expect(screen.getByTestId('streaming-reply').textContent).toContain('Here is what I found')
    expect(screen.getByTestId('thinking-pill').textContent).toContain('Thinking · 10 s')
  })
})

describe('the pill\'s words @SC-1005', () => {
  const made = [
    { label: 'Your places', ms: 1_000 },
    { label: 'Started: List every file in my space', ms: 2_000, made: 'started' as const },
    { label: 'Started: List every file in Walkthrough', ms: 2_000, made: 'started' as const },
  ]

  it('say what the turn started or set once it has ended', () => {
    expect(thinkingLabel({ ms: 6_000, steps: made }, 0)).toBe('Thought for 6 s · started 2')
    expect(thinkingLabel({ ms: 9_000, steps: [{ label: 'Set WAL-4', made: 'set' }] }, 0)).toBe('Thought for 9 s · set 1')
    expect(thinkingLabel({ ms: 3_000, steps: [] }, 0)).toBe('Thought for 3 s')
  })

  it('say only how long it has been thinking while it runs', () => {
    expect(thinkingLabel({ since: 0, steps: made }, 4_000)).toBe('Thinking · 4 s')
  })

  it('show on a reply that only started work, with what it started among the steps', () => {
    render(<MessageItem message={reply({ text: "I've started: List every file.", thinking: { ms: 6_000, steps: made.slice(1) } })} agent={agent} />)
    expect(screen.getByTestId('thinking-pill').textContent).toContain('Thought for 6 s · started 2')
    fireEvent.click(screen.getByTestId('thinking-pill'))
    expect(screen.getByTestId('thinking-steps').querySelectorAll('li')[0]!.textContent).toBe('↳Started: List every file in my space')
  })
})

describe('your turn @SC-1008', () => {
  it('offers Copy under the agent\'s words once its turn has ended, and copies them', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText: write } })
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
    render(<MessageItem message={reply({ text: 'The dark blue one.' })} agent={agent} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(write).toHaveBeenCalledWith('The dark blue one.')
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy()
  })

  it('offers nothing under a reply with no words', () => {
    render(<MessageItem message={reply({ text: '  ', thinking: { ms: 1_000, steps: [] } })} agent={agent} />)
    expect(screen.queryByTestId('reply-actions')).toBeNull()
  })
})
