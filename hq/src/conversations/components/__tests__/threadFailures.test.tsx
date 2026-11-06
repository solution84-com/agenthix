// @vitest-environment jsdom
/** A failed or stopped turn in the thread (area 2b, improvements 7 and 8): plain words, who fixes it, Try again. */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'

const h = vi.hoisted(() => ({ role: 'MEMBER' as string }))
vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ data: { role: h.role } }),
  useAction: () => vi.fn(),
  getUserSettings: 'getUserSettings',
  getConversationPlaces: 'getConversationPlaces',
  addConversationPlace: vi.fn(),
}))
vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => null }))
vi.mock('../../../shared/components/MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <p>{content}</p> }))

import { ThreadMessages } from '../ThreadMessages'
import { failureWords } from '../failureWords'
import { failedTurnOf, personWordsOfTurn } from '../../hooks/threadBlocks'

afterEach(cleanup)

const agent = { id: 'a1', name: 'Kernel', handle: 'kernel', avatarUrl: null }
const AUTH = 'Anthropic refused the key HQ uses. An organisation admin can check it under Manage organisation › Providers.'

function msg(seq: number, role: 'PERSON' | 'AGENT', kind: 'TEXT' | 'FAILED', body: Record<string, unknown>, extra: Record<string, unknown> = {}): ConversationMessageView {
  return {
    id: `m${seq}`, seq, clientMessageId: null, role, authorId: role === 'PERSON' ? 'u1' : null, agentId: role === 'AGENT' ? 'a1' : null,
    kind, body, spoken: false, interrupted: false, operationId: null, turnId: 't1', queueState: null,
    createdAt: '2026-10-16T11:15:00.000Z', ...extra,
  } as ConversationMessageView
}
const asked = msg(1, 'PERSON', 'TEXT', { text: 'Summarise the board' })

function thread(messages: ConversationMessageView[], props: Partial<Parameters<typeof ThreadMessages>[0]> = {}) {
  return render(
    <MemoryRouter>
      <ThreadMessages
        messages={messages} waiting={[]} stream={null} running={false} agent={agent} hasMore={false} loadingOlder={false}
        onLoadOlder={() => {}} busy={false} onSendNow={() => {}} onCancel={() => {}} {...props}
      />
    </MemoryRouter>,
  )
}

describe('the words of a failure @SC-1005', () => {
  it('splits what happened from the sentences addressed to an organisation admin', () => {
    expect(failureWords(AUTH)).toEqual({ what: 'Anthropic refused the key HQ uses.', adminFixes: true, providers: true })
    expect(failureWords('OpenAI is limiting how fast this can run. Wait a moment and send it again.').adminFixes).toBe(false)
  })

  it('gives a member the line that an administrator has been told, and no way into Providers', () => {
    h.role = 'MEMBER'
    thread([asked, msg(2, 'AGENT', 'FAILED', { reason: AUTH })])
    expect(screen.getByTestId('failed-card').textContent).toContain('Anthropic refused the key HQ uses.')
    expect(screen.getByTestId('failed-who').textContent).toBe('An administrator has been told.')
    expect(screen.queryByRole('link', { name: 'Open Providers' })).toBeNull()
  })

  it('gives an administrator the way to Providers', () => {
    h.role = 'ADMIN'
    thread([asked, msg(2, 'AGENT', 'FAILED', { reason: AUTH })])
    expect(screen.getByRole('link', { name: 'Open Providers' }).getAttribute('href')).toBe('/admin/providers')
    expect(screen.getByTestId('failed-card').textContent).not.toContain('An administrator has been told')
  })

  it('says nothing about an administrator when none is needed', () => {
    thread([asked, msg(2, 'AGENT', 'FAILED', { reason: 'OpenAI is limiting how fast this can run. Wait a moment and send it again.' })])
    expect(screen.queryByTestId('failed-who')).toBeNull()
  })

  it('marks a half-written answer with where it stopped, before the failure', () => {
    thread([asked, msg(2, 'AGENT', 'FAILED', { reason: AUTH, partialText: 'The board has three' })])
    expect(screen.getByText('The board has three')).toBeTruthy()
    expect(screen.getByTestId('answer-stopped').textContent).toBe('The answer stopped here.')
  })

  it('has no stopped mark on a failure that wrote nothing', () => {
    thread([asked, msg(2, 'AGENT', 'FAILED', { reason: AUTH })])
    expect(screen.queryByTestId('answer-stopped')).toBeNull()
  })
})

describe('Try again @SC-1005', () => {
  it('is on the newest failed turn and sends the turn\'s message again', () => {
    const again = vi.fn()
    thread([asked, msg(2, 'AGENT', 'FAILED', { reason: AUTH })], { onTryAgain: again })
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(again).toHaveBeenCalledWith('t1')
  })

  it('is on a stopped turn too', () => {
    const again = vi.fn()
    thread([asked, msg(2, 'AGENT', 'TEXT', { text: 'The board has' }, { interrupted: true })], { onTryAgain: again })
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(again).toHaveBeenCalledWith('t1')
  })

  it('is not offered where the person cannot write', () => {
    thread([asked, msg(2, 'AGENT', 'FAILED', { reason: AUTH })])
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('is on the newest turn only', () => {
    const again = vi.fn()
    const second = msg(4, 'AGENT', 'TEXT', { text: 'Here it is.' }, { turnId: 't2' })
    thread([asked, msg(2, 'AGENT', 'FAILED', { reason: AUTH }), msg(3, 'PERSON', 'TEXT', { text: 'Again' }, { turnId: 't2' }), second], { onTryAgain: again })
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('carries the switch the person may take on the failed turn', () => {
    const onSwitch = vi.fn()
    thread([asked, msg(2, 'AGENT', 'FAILED', { reason: AUTH })], { offer: { label: 'OpenRouter', onSwitch } })
    fireEvent.click(screen.getByRole('button', { name: 'Switch to OpenRouter' }))
    expect(onSwitch).toHaveBeenCalledTimes(1)
  })
})

describe('what the thread stands at @SC-1005', () => {
  it('is a failed turn only while nothing the person or the agent said came after', () => {
    const failed = msg(2, 'AGENT', 'FAILED', { reason: AUTH })
    expect(failedTurnOf([asked, failed])).toBe('t1')
    expect(failedTurnOf([asked, failed, msg(3, 'PERSON', 'TEXT', { text: 'again' }, { turnId: 't2' })])).toBeNull()
    expect(failedTurnOf([asked])).toBeNull()
  })

  it('reads the words the turn answered, in order', () => {
    expect(personWordsOfTurn([asked, msg(2, 'PERSON', 'TEXT', { text: 'and the tasks' }), msg(3, 'AGENT', 'FAILED', { reason: AUTH })], 't1'))
      .toBe('Summarise the board\n\nand the tasks')
  })
})
