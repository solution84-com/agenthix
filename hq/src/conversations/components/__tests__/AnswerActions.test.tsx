// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'

const h = vi.hoisted(() => ({ facts: undefined as unknown, task: undefined as unknown }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (op: string) => ({ data: op === 'getAnswerFacts' ? h.facts : h.task, error: null, isLoading: false }),
  getAnswerFacts: 'getAnswerFacts', getTask: 'getTask', getOperationResult: 'getOperationResult', speakAnswer: vi.fn(),
}))
vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => null }))
vi.mock('../../../shared/components/MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <p>{content}</p> }))

import { TurnBlockView } from '../TurnBlock'
import { ListenContext } from '../ListenButton'
import { setListenBackendForTests, type ListenBackend } from '../listenPlayer'
import { ThreadNudgesContext } from '../../hooks/useThreadNudges'

afterEach(() => {
  cleanup()
  setListenBackendForTests(null)
})

const agent = { id: 'a1', name: 'Writer', handle: 'writer', avatarUrl: null }
let seq = 0
function msg(kind: string, body: unknown, over: Record<string, unknown> = {}): ConversationMessageView {
  seq++
  return {
    id: `m${seq}`, seq, clientMessageId: null, role: 'AGENT', authorId: null, agentId: 'a1', kind, body, spoken: false,
    interrupted: false, operationId: null, turnId: 't1', queueState: null, createdAt: '2026-11-05T18:10:00.000Z', ...over,
  } as ConversationMessageView
}
const work = { conversationId: 'c1', myId: 'u1', placePath: '/projects/WEB' }
const answer = msg('TEXT', { text: 'Done. I made a task, *Check the footer links*.' })
const task = msg('TASK', { taskId: 'k9', taskKey: 'WEB-9', title: 'Check the footer links' })

function draw(listen: boolean, block = { cards: [], words: [answer], set: [], made: [task] } as Parameters<typeof TurnBlockView>[0]['block']) {
  return render(
    <MemoryRouter>
      <ListenContext.Provider value={listen ? { conversationId: 'c1' } : null}>
        <TurnBlockView block={block as never} agent={agent} work={work} />
      </ListenContext.Provider>
    </MemoryRouter>,
  )
}

describe('what the turn made, at the end of the answer', () => {
  it('is one card: its title, then what it is, its key and its state; the whole card opens it', () => {
    h.task = { typeColumn: null, state: 'TODO', assignedAgent: null }
    draw(false)
    const card = screen.getByTestId('task-card')
    expect(card.textContent).toBe('Check the footer linksTask WEB-9 · To do · no agent yet')
    expect(card.getAttribute('href')).toBe('/tasks/WEB-9')
    const block = screen.getByTestId('agent-block')
    // After the words, before the icons under the answer.
    expect(block.textContent!.indexOf('Done.')).toBeLessThan(block.textContent!.indexOf('Check the footer linksTask'))
    expect(card.compareDocumentPosition(screen.getByTestId('reply-actions')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('the icons under an answer', () => {
  it('are each a 32 px target, 44 px on a phone', () => {
    draw(true)
    for (const name of ['Copy', 'Read aloud', 'More about this answer']) {
      const button = screen.getByRole('button', { name })
      expect(button.className).toContain('h-8 w-8')
      expect(button.className).toContain('max-lg:h-11 max-lg:w-11')
    }
  })

  it('hold the speaker only where voice is available', () => {
    draw(false)
    expect(screen.queryByRole('button', { name: 'Read aloud' })).toBeNull()
  })

  it('show what the answer used under ⋯, as its turn recorded it', () => {
    h.facts = { model: 'DeepSeek Flash', ms: 26_000, tokensRead: 4_210, tokensWritten: 312 }
    draw(false)
    fireEvent.click(screen.getByRole('button', { name: 'More about this answer' }))
    expect(screen.getByTestId('answer-facts').textContent).toBe('What this answer usedDeepSeek Flash · 26 s · 4,210 tokens read · 312 written')
  })

  it('says an answer with no record of its turn kept none, rather than an error', () => {
    h.facts = null
    draw(false)
    fireEvent.click(screen.getByRole('button', { name: 'More about this answer' }))
    expect(screen.getByTestId('answer-facts').textContent).toBe('What this answer usedNot recorded for this answer.')
  })
})

describe('the speaker @SC-1933', () => {
  function backend() {
    const ends: Array<() => void> = []
    const played: string[] = []
    const fetched: number[] = []
    const b: ListenBackend = {
      fetchPart: vi.fn(async ({ part }) => { fetched.push(part); return { audio: `part${part}`, parts: 2 } }),
      play: vi.fn((audio: string) => {
        played.push(audio)
        let end = () => {}
        const done = new Promise<void>((resolve) => { end = resolve })
        ends.push(end)
        return { done, stop: end }
      }),
    }
    setListenBackendForTests(b)
    return { b, ends, played, fetched }
  }

  it('reads the answer aloud part after part, and stops when pressed again', async () => {
    const { ends, played, fetched } = backend()
    draw(true)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Read aloud' })) })
    expect(played).toEqual(['part0'])
    expect(fetched).toEqual([0, 1])
    expect(screen.getByRole('button', { name: 'Stop reading aloud' }).getAttribute('aria-pressed')).toBe('true')
    await act(async () => { ends[0]!() })
    expect(played).toEqual(['part0', 'part1'])
    fireEvent.click(screen.getByRole('button', { name: 'Stop reading aloud' }))
    expect(screen.getByRole('button', { name: 'Read aloud' })).toBeTruthy()
  })

  it('says why as a line in the thread, with Try again, when the answer could not be read', async () => {
    setListenBackendForTests({ fetchPart: async () => { throw new Error('Voice is down: text to speech isn\'t working.') }, play: vi.fn() })
    const push = vi.fn()
    render(
      <MemoryRouter>
        <ThreadNudgesContext.Provider value={{ push, clear: vi.fn() }}>
          <ListenContext.Provider value={{ conversationId: 'c1' }}>
            <TurnBlockView block={{ cards: [], words: [answer], set: [], made: [task] } as never} agent={agent} work={work} />
          </ListenContext.Provider>
        </ThreadNudgesContext.Provider>
      </MemoryRouter>,
    )
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Read aloud' })) })
    expect(push).toHaveBeenCalledWith(expect.objectContaining({
      text: "The answer was not read aloud: Voice is down: text to speech isn't working.", retry: expect.any(Function),
    }))
    expect(screen.getByRole('button', { name: 'Read aloud' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
