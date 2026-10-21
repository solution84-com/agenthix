// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'

const h = vi.hoisted(() => ({
  start: vi.fn(),
  voiceStart: vi.fn(),
  choices: { data: undefined as unknown, error: null as { message: string } | null },
  securePage: true,
}))
// jsdom is not a secure page: it has no microphone, so each test says whether the page has one.
vi.mock('../../../shared/securePage', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../shared/securePage')>(),
  microphonePossible: () => h.securePage,
}))
vi.mock('wasp/client/operations', () => ({
  startConversation: 'startConversation',
  getConversationAgentChoices: 'getConversationAgentChoices',
  useAction: () => h.start,
  useQuery: () => h.choices,
}))
vi.mock('../StartModelPicker', () => ({
  StartModelPicker: ({ picked, onPick }: { picked: string | null; onPick: (m: string) => void }) => (
    <button type="button" data-testid="model-button" onClick={() => onPick('claude-opus-5')}>model:{picked ?? 'default'}</button>
  ),
}))
vi.mock('../AgentPicker', () => ({
  AgentPicker: ({ agents, selectedId, onSelect }: { agents: { id: string; name: string }[]; selectedId: string; onSelect: (id: string) => void }) => (
    <span data-testid="agent-button" data-selected={selectedId}>
      {agents.map(a => <button key={a.id} type="button" onClick={() => onSelect(a.id)}>agent:{a.name}</button>)}
    </span>
  ),
}))
vi.mock('@agenthix/ui/sessions', () => ({ useMentionTarget: () => undefined }))
vi.mock('../../../shared/providers/VoiceCallProvider', () => ({ useVoiceCall: () => ({ start: h.voiceStart, prepare: () => undefined }) }))

import { NewConversationBox } from '../NewConversationBox'

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>
}
function renderBox(initial = '/chat') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/chat" element={<NewConversationBox home="PERSON" basePath="/chat" placeholder="Ask your agent…" noAgentsNotice="Add an agent first" />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}
const kernel = { id: 'k', name: 'Kernel', handle: 'kernel', avatarUrl: null }
const writer = { id: 'w', name: 'Writer', handle: 'writer', avatarUrl: null }

beforeEach(() => {
  h.securePage = true
  h.start.mockReset().mockResolvedValue({ conversationId: 'c9', messageId: 'm1' })
  h.voiceStart.mockReset()
  h.choices.data = [kernel, writer]
  h.choices.error = null
})
afterEach(cleanup)

describe('the message box that starts a conversation @SC-1007', () => {
  it('is empty and writable again once the conversation is started, where it stays on screen (the dock) @SC-1037', async () => {
    render(
      <MemoryRouter initialEntries={['/chat']}>
        <Routes>
          <Route path="*" element={<NewConversationBox home="PERSON" basePath="/chat" placeholder="Ask your agent…" noAgentsNotice="Add an agent first" />} />
        </Routes>
      </MemoryRouter>,
    )
    const box = screen.getByLabelText('Ask your agent…') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: 'Hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(h.start).toHaveBeenCalled())
    await waitFor(() => expect(box.value).toBe(''))
    expect(box.disabled).toBe(false)
  })

  it('starts with the primary agent, which is the first choice, and opens the conversation @SC-940', async () => {
    renderBox()
    fireEvent.change(screen.getByLabelText('Ask your agent…'), { target: { value: 'Hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/chat/t/c9'))
    const args = h.start.mock.calls[0][0]
    expect(args).toMatchObject({ home: 'PERSON', text: 'Hello' })
    expect(args.agentId).toBeUndefined()
    expect(typeof args.clientMessageId).toBe('string')
  })

  it('starts with the agent the person picks before the first message', async () => {
    renderBox()
    fireEvent.click(screen.getByText('agent:Writer'))
    fireEvent.change(screen.getByLabelText('Ask your agent…'), { target: { value: 'Draft this' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(h.start).toHaveBeenCalled())
    expect(h.start.mock.calls[0][0].agentId).toBe('w')
  })

  it('sends no model when none was picked, and the picked one when it was', async () => {
    renderBox()
    fireEvent.change(screen.getByLabelText('Ask your agent…'), { target: { value: 'One' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(h.start).toHaveBeenCalledTimes(1))
    expect(h.start.mock.calls[0][0].model).toBeUndefined()
    cleanup()
    renderBox()
    fireEvent.click(screen.getByText('model:default'))
    fireEvent.change(screen.getByLabelText('Ask your agent…'), { target: { value: 'Two' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(h.start).toHaveBeenCalledTimes(2))
    expect(h.start.mock.calls[1][0].model).toBe('claude-opus-5')
  })

  it('starts with the agent a link names, such as the agent of a closed conversation', async () => {
    renderBox('/chat?agent=w')
    expect(screen.getByTestId('agent-button').getAttribute('data-selected')).toBe('w')
  })

  it('starts with the agent it is given, before one a link names, and sends it @SC-1035', async () => {
    render(
      <MemoryRouter initialEntries={['/chat?agent=k']}>
        <Routes>
          <Route path="*" element={<NewConversationBox home="PERSON" basePath="/chat" placeholder="Ask your agent…" noAgentsNotice="Add an agent first" agentId="w" />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('agent-button').getAttribute('data-selected')).toBe('w')
    fireEvent.change(screen.getByLabelText('Ask your agent…'), { target: { value: 'Hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(h.start).toHaveBeenCalled())
    expect(h.start.mock.calls[0][0].agentId).toBe('w')
  })

  it('reports the agent it starts with, and each one the person picks @SC-1035', () => {
    const onAgentChange = vi.fn()
    render(
      <MemoryRouter initialEntries={['/chat']}>
        <Routes>
          <Route path="*" element={<NewConversationBox home="PERSON" basePath="/chat" placeholder="Ask your agent…" noAgentsNotice="Add an agent first" onAgentChange={onAgentChange} />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(onAgentChange).toHaveBeenLastCalledWith(kernel)
    fireEvent.click(screen.getByText('agent:Writer'))
    expect(onAgentChange).toHaveBeenLastCalledWith(writer)
    expect(onAgentChange).toHaveBeenCalledTimes(2)
  })

  it('has the agent and the model as two buttons at the bottom-left of the box, Send alone on the right', () => {
    renderBox()
    fireEvent.change(screen.getByLabelText('Ask your agent…'), { target: { value: 'hello' } })
    const send = screen.getByRole('button', { name: 'Send' })
    const agent = screen.getByTestId('agent-button')
    const model = screen.getByTestId('model-button')
    expect(agent.parentElement).toBe(model.parentElement)
    expect(agent.parentElement?.parentElement).toBe(send.parentElement)
    expect(agent.parentElement?.nextElementSibling).toBe(send)
    expect(agent.getAttribute('data-selected')).toBe('k')
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('sends a retry with the same client id, so the message is stored once @SC-940', async () => {
    h.start.mockRejectedValueOnce(new Error('The connection dropped')).mockResolvedValueOnce({ conversationId: 'c9', messageId: 'm1' })
    renderBox()
    fireEvent.change(screen.getByLabelText('Ask your agent…'), { target: { value: 'Hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText('The connection dropped')
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(h.start).toHaveBeenCalledTimes(2))
    expect(h.start.mock.calls[1][0].clientMessageId).toBe(h.start.mock.calls[0][0].clientMessageId)
  })

  it('says why in place of the box when the person may not talk here', () => {
    h.choices.data = undefined
    h.choices.error = { message: 'Talking to this project\'s agents needs the Member or Admin role in it.' }
    renderBox()
    expect(screen.getByText(/needs the Member or Admin role/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
  })

  it('says to add an agent when there is none to talk to', () => {
    h.choices.data = []
    renderBox()
    expect(screen.getByText('Add an agent first')).toBeTruthy()
  })

  it('starts a conversation for voice from its empty box, opens it and starts voice there', async () => {
    h.start.mockResolvedValue({ conversationId: 'c9', messageId: null })
    renderBox()
    fireEvent.click(screen.getByRole('button', { name: 'Start voice' }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/chat/t/c9'))
    expect(h.start).toHaveBeenCalledWith(expect.objectContaining({ home: 'PERSON', text: '', voice: true }))
    expect(h.voiceStart).toHaveBeenCalledWith('c9', { name: 'Kernel', avatarUrl: null }, '/chat/t/c9')
  })

  it('greys the voice button when the agent cannot talk, and says why when tapped, starting nothing', () => {
    h.choices.data = [{ ...kernel, voiceRefusal: 'Kernel has no voice yet.' }]
    renderBox()
    fireEvent.click(screen.getByRole('button', { name: /Start voice \(unavailable/ }))
    expect(screen.getByTestId('voice-reason').textContent).toBe('Kernel has no voice yet.')
    expect(h.start).not.toHaveBeenCalled()
  })

  it('greys the voice button on a page that is not secure, saying voice needs https or this computer', () => {
    h.securePage = false
    renderBox()
    fireEvent.click(screen.getByRole('button', { name: /Start voice \(unavailable/ }))
    expect(screen.getByTestId('voice-reason').textContent).toMatch(/need a secure page: open HQ over https, or on this computer at localhost/)
    expect(h.start).not.toHaveBeenCalled()
  })

  it('becomes Send once there is text', () => {
    renderBox()
    fireEvent.change(screen.getByLabelText('Ask your agent…'), { target: { value: 'hello' } })
    expect(screen.queryByRole('button', { name: 'Start voice' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy()
  })
})
