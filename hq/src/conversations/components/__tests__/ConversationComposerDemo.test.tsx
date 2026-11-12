// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ConversationView } from '../../../shared/conversations/protocol'

const h = vi.hoisted(() => ({ prompts: {} as Record<string, string[]>, demo: false, inVoice: false }))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u1' } }) }))
vi.mock('wasp/client/operations', () => ({
  getDemoInfo: 'getDemoInfo',
  getModelChoices: 'getModelChoices',
  setConversationModel: 'setConversationModel',
  shareConversationFile: 'shareConversationFile',
  useAction: () => vi.fn(),
  useQuery: (op: string) => ({ data: op === 'getDemoInfo' && h.demo ? { on: true, nextResetAt: '', agents: {} } : undefined }),
}))
vi.mock('../../../shared/providers/VoiceCallProvider', () => ({
  useVoiceCall: () => ({ voice: { conversationId: h.inVoice ? 'c1' : null, phase: h.inVoice ? 'listening' : 'off', muted: false, partial: '' }, start: vi.fn(), end: vi.fn(), toggleMute: vi.fn(), stopSpeaking: () => false, prepare: vi.fn(), runtime: () => null }),
}))
vi.mock('../MessageBox', () => ({ MessageBox: ({ voice, dictateRefusal }: { voice: { available: boolean; reason: string | null }; dictateRefusal?: { reason: string } }) => <div data-testid="message-box" data-available={String(voice.available)} data-reason={voice.reason ?? ''} data-dictate-refused={dictateRefusal?.reason ?? ''} /> }))
vi.mock('../DemoVoicePanel', () => ({ DemoVoicePanel: () => <div data-testid="demo-voice" /> }))
vi.mock('../ConversationModelPicker', () => ({ ConversationModelPicker: () => null }))
vi.mock('../SharedTray', () => ({ SharedTray: () => null }))
vi.mock('../../../demo/lead/useSuggestedPrompts', () => ({ useSuggestedPrompts: (handle?: string) => (handle ? h.prompts[handle] ?? [] : []) }))

import { ConversationComposer } from '../ConversationComposer'

const view = (people: ConversationView['people'] = []) => ({
  agent: { id: 'w', name: 'Writer', handle: 'writer', avatarUrl: null },
  voice: { holderId: null },
  people,
  talkingModel: null,
}) as unknown as ConversationView

function renderComposer(v: ConversationView, onSend = vi.fn().mockResolvedValue(true)) {
  render(<ConversationComposer conversationId="c1" view={v} running={false} sending={false} onSend={onSend} onStop={async () => undefined} />)
  return onSend
}

beforeEach(() => { h.prompts = { writer: ['What can you do?'] }; h.demo = false; h.inVoice = false })
afterEach(cleanup)

describe("the demo's suggestions under a conversation's message box (ADR-0186) @SC-1959", () => {
  it('sends the words of the one tapped, then stays as a compact row the fallback can point to', async () => {
    const onSend = renderComposer(view())
    expect(screen.getByTestId('suggested-prompts').dataset.compact).toBeUndefined()
    fireEvent.click(screen.getByRole('button', { name: 'What can you do?' }))
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('What can you do?', undefined, []))
    await waitFor(() => expect(screen.getByTestId('suggested-prompts').dataset.compact).toBe('true'))
  })

  it('are a compact row once the person has said something here', () => {
    renderComposer(view([{ id: 'u1', name: 'Visitor', avatarUrl: null }]))
    expect(screen.getByTestId('suggested-prompts').dataset.compact).toBe('true')
    expect(screen.getByRole('button', { name: 'What can you do?' })).toBeTruthy()
  })

  it('sit above the message box, not under it', () => {
    renderComposer(view())
    const row = screen.getByTestId('suggested-prompts')
    const box = screen.getByTestId('message-box')
    expect(row.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('are hidden while the demo voice is on, which shows only the voice lines', () => {
    h.demo = true; h.inVoice = true
    renderComposer(view())
    expect(screen.queryByTestId('suggested-prompts')).toBeNull()
    expect(screen.getByTestId('demo-voice')).toBeTruthy()
  })

  it('stay in the demo when voice is not on', () => {
    h.demo = true
    renderComposer(view())
    expect(screen.getByTestId('suggested-prompts')).toBeTruthy()
  })

  it('are none outside the demo @SC-1979', () => {
    h.prompts = {}
    renderComposer(view())
    expect(screen.queryByTestId('suggested-prompts')).toBeNull()
  })
})

describe("the demo's voice call under a conversation's message box @SC-1961", () => {
  it('shows the demo voice screen in a call, only in the demo', () => {
    h.demo = true; h.inVoice = true
    renderComposer(view())
    expect(screen.getByTestId('demo-voice')).toBeTruthy()
  })

  it('shows none outside the demo, call or not @SC-1979', () => {
    h.inVoice = true
    renderComposer(view())
    expect(screen.queryByTestId('demo-voice')).toBeNull()
  })

  it('shows none in the demo before a call starts', () => {
    h.demo = true
    renderComposer(view())
    expect(screen.queryByTestId('demo-voice')).toBeNull()
  })
})

describe("Dictate under a conversation's message box (usability finding 4) @SC-1965", () => {
  it('is refused in the demo', () => {
    h.demo = true
    renderComposer(view())
    expect(screen.getByTestId('message-box').getAttribute('data-dictate-refused')).toBe("The demo can't do this.")
  })

  it('is offered outside the demo', () => {
    renderComposer(view())
    expect(screen.getByTestId('message-box').getAttribute('data-dictate-refused')).toBe('')
  })
})
