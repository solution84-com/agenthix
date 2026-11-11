// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { ReadNudgesHeld } from '@agenthix/ui/attention'

const h = vi.hoisted(() => ({
  start: vi.fn(),
  voiceStart: vi.fn(),
  choices: { data: undefined as unknown, error: null as { message: string } | null },
  securePage: true,
  skillsAsked: [] as unknown[],
  skills: { data: { skills: [] as unknown[] }, isLoading: false, error: undefined },
  access: { data: { canTalk: true, fix: null, added: { model: false }, isAdmin: true } as unknown },
}))
// jsdom is not a secure page: it has no microphone, so each test says whether the page has one.
vi.mock('../../../shared/securePage', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../shared/securePage')>(),
  microphonePossible: () => h.securePage,
}))
vi.mock('wasp/client/operations', () => ({
  startConversation: 'startConversation',
  getConversationAgentChoices: 'getConversationAgentChoices',
  listConversationSkills: 'listConversationSkills',
  listStartSkills: 'listStartSkills',
  getMyModelAccess: 'getMyModelAccess',
  useAction: () => h.start,
  useQuery: (op: string, args: unknown) => {
    if (op === 'getMyModelAccess') return h.access
    if (op !== 'listStartSkills') return h.choices
    h.skillsAsked.push(args)
    return h.skills
  },
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
import { DockLayer } from '../../../dock/DockLayer'

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>
}
function renderBox(initial = '/chat', autoFocus = false, held = false) {
  return render(
    <ReadNudgesHeld.Provider value={held}><MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/chat" element={<NewConversationBox home="PERSON" basePath="/chat" placeholder="Ask your agent…" noAgentsNotice="Add an agent first" autoFocus={autoFocus} />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter></ReadNudgesHeld.Provider>,
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
  h.skillsAsked = []
  h.access.data = { canTalk: true, fix: null, added: { model: false }, isAdmin: true }
  h.skills = { data: { skills: [{ name: 'org-code-review', title: 'Code review', description: 'Review a change', source: 'every-agent', sourceName: 'Fernhill', detail: 'fernhill/code-review 1.0.0' }] }, isLoading: false, error: undefined }
})

describe('the / picker in the box that starts a conversation (skills spec part 5)', () => {
  it("lists the chosen agent's skills here, and sends the one picked beside the first message, never in its text", async () => {
    renderBox()
    const box = screen.getByLabelText('Ask your agent…') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: '/' } })
    expect(screen.getByRole('listbox', { name: 'Skills' }).textContent).toContain('Code review')
    expect(h.skillsAsked.at(-1)).toEqual({ home: 'PERSON', agentId: 'k' })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(box.value).toBe('/org-code-review ')
    expect(screen.getByTestId('skill-mark').textContent).toBe('/org-code-review')
    expect(h.start).not.toHaveBeenCalled()

    fireEvent.change(box, { target: { value: '/org-code-review Review the checkout change' } })
    expect(screen.getByTestId('skill-mark').textContent).toBe('/org-code-review')
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(h.start).toHaveBeenCalled())
    expect(h.start.mock.calls[0]![0]).toMatchObject({ text: 'Review the checkout change', skill: { name: 'org-code-review' } })
  })

  it('lets the picked skill go when another agent is chosen', () => {
    renderBox()
    const box = screen.getByLabelText('Ask your agent…') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: '/' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(screen.getByTestId('skill-mark')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'agent:Writer' }))
    expect(screen.queryByTestId('skill-mark')).toBeNull()
  })

  it('lets the skill go when its text is changed, and sends the words as typed', async () => {
    renderBox()
    const box = screen.getByLabelText('Ask your agent…') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: '/' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    fireEvent.change(box, { target: { value: '/org-code-revie hello' } })
    expect(screen.queryByTestId('skill-mark')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(h.start).toHaveBeenCalled())
    expect(h.start.mock.calls[0]![0].text).toBe('/org-code-revie hello')
    expect(h.start.mock.calls[0]![0].skill).toBeUndefined()
  })

  it('a typed /name that was never picked stays plain text', () => {
    renderBox()
    fireEvent.change(screen.getByLabelText('Ask your agent…'), { target: { value: '/org-code-review hello' } })
    expect(screen.queryByTestId('skill-mark')).toBeNull()
  })

  it('opens for a / at the start only', () => {
    renderBox()
    fireEvent.change(screen.getByLabelText('Ask your agent…'), { target: { value: 'see src/' } })
    expect(screen.queryByRole('listbox', { name: 'Skills' })).toBeNull()
  })
})
afterEach(cleanup)

describe('the message box that starts a conversation @SC-1007 @SC-1929', () => {
  it('takes the caret when it is asked to, but never from a field being typed in', () => {
    renderBox('/chat', true)
    expect(document.activeElement).toBe(screen.getByLabelText('Ask your agent…'))
    cleanup()
    const field = document.body.appendChild(document.createElement('textarea'))
    field.focus()
    renderBox('/chat', true)
    expect(document.activeElement).toBe(field)
    field.remove()
  })

  it('takes the caret in an overlay opened when its agents are already known, its effects run twice as in development', () => {
    // A second open of the dock's New conversation: the agents are cached, so the box can focus at once, and the
    // overlay's own effect (which puts the caret back on closing) runs, is undone and runs again around it.
    const opener = document.body.appendChild(document.createElement('button'))
    opener.focus()
    render(
      <React.StrictMode>
        <MemoryRouter initialEntries={['/chat']}>
          <DockLayer label="New conversation" heading="New conversation" narrow={false} onClose={() => undefined}>
            <NewConversationBox home="PERSON" basePath="/chat" placeholder="Ask your agent…" noAgentsNotice="Add an agent first" autoFocus />
          </DockLayer>
        </MemoryRouter>
      </React.StrictMode>,
    )
    expect(document.activeElement).toBe(screen.getByLabelText('Ask your agent…'))
    opener.remove()
  })

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
    h.choices.error = { message: 'Talking to this project\'s agents needs the Member or Admin role in it.', statusCode: 403 } as { message: string }
    renderBox()
    expect(screen.getByText(/needs the Member or Admin role/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('says the agents could not be read in place of the box, with Try again, when HQ did not answer', () => {
    h.choices.data = undefined
    h.choices.error = { message: 'Network Error' }
    renderBox()
    expect(screen.getByText(/The agents could not be read/)).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('holds the agents-not-read line back while the frame line says HQ is not answering, but not a final answer', () => {
    h.choices.data = undefined
    h.choices.error = { message: 'Network Error' }
    renderBox('/chat', false, true)
    expect(screen.queryByText(/The agents could not be read/)).toBeNull()
    cleanup()
    h.choices.error = { message: 'Talking to this project\'s agents needs the Member or Admin role in it.', statusCode: 403 } as { message: string }
    renderBox('/chat', false, true)
    expect(screen.getByText(/needs the Member or Admin role/)).toBeTruthy()
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
    const button = screen.getByRole('button', { name: 'Start voice' })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    fireEvent.mouseEnter(button)
    expect(screen.getByTestId('tooltip').textContent).toBe('Kernel has no voice yet.')
    fireEvent.click(button)
    expect(screen.getByTestId('attention-text').textContent).toBe('Kernel has no voice yet.')
    expect(h.start).not.toHaveBeenCalled()
  })

  it('greys the voice button on a page that is not secure, saying voice needs https or this computer', () => {
    h.securePage = false
    renderBox()
    fireEvent.click(screen.getByRole('button', { name: 'Start voice' }))
    expect(screen.getByTestId('attention-text').textContent).toMatch(/need a secure page: open HQ over https, or on this computer at localhost/)
    expect(h.start).not.toHaveBeenCalled()
  })

  it('greys the whole box for someone who cannot talk to agents yet, and a press says who can fix it @SC-722 @SC-1911', () => {
    h.access.data = { canTalk: false, fix: 'org-access', isAdmin: false, added: { model: true, voice: true } }
    renderBox()
    const form = screen.getByRole('button', { hidden: true, name: 'Start voice' }).closest('form')!
    expect(form.getAttribute('aria-disabled')).toBe('true')
    fireEvent.mouseEnter(form)
    expect(screen.getByTestId('tooltip').textContent).toBe("Agents can't answer you yet")
    fireEvent.click(form)
    expect(screen.getByTestId('attention-text').textContent).toContain('No model is working')
    expect(screen.getByTestId('attention-text').textContent).toContain('An organisation admin can set one up')
  })

  it('points an organisation admin to Providers from that dialog @SC-722', () => {
    h.access.data = { canTalk: false, fix: 'org-access', isAdmin: true, added: { model: false, voice: false } }
    renderBox()
    const form = screen.getByRole('button', { hidden: true, name: 'Start voice' }).closest('form')!
    fireEvent.click(form)
    expect(screen.getByRole('link', { name: 'Manage organisation › Providers' }).getAttribute('href')).toBe('/admin/providers')
  })

  it('becomes Send once there is text', () => {
    renderBox()
    fireEvent.change(screen.getByLabelText('Ask your agent…'), { target: { value: 'hello' } })
    expect(screen.queryByRole('button', { name: 'Start voice' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy()
  })
})

describe('the box on an agent’s page', () => {
  it('offers only the agents it is given, starting with the one asked for, and starts the conversation with it', async () => {
    render(
      <MemoryRouter initialEntries={['/agents/writer']}>
        <Routes>
          <Route path="/agents/writer" element={<NewConversationBox home="PERSON" basePath="/chat" placeholder="Talk to Writer…" noAgentsNotice="This agent cannot be talked to" agentId="w" onlyAgentIds={['w']} />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.queryByText('agent:Kernel')).toBeNull()
    expect(screen.getByText('agent:Writer')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Talk to Writer…'), { target: { value: 'Hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(h.start).toHaveBeenCalled())
    expect(h.start.mock.calls[0][0]).toMatchObject({ home: 'PERSON', agentId: 'w', text: 'Hello' })
  })

  it('says the agent cannot be talked to when none of those it is given may be', () => {
    render(
      <MemoryRouter>
        <NewConversationBox home="PERSON" basePath="/chat" placeholder="Talk to Coder…" noAgentsNotice="This agent cannot be talked to" agentId="c" onlyAgentIds={['c']} />
      </MemoryRouter>,
    )
    expect(screen.getByText('This agent cannot be talked to')).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
