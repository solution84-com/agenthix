// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'

const startConversation = vi.fn()
const role = { value: 'MEMBER' }
const skillAnswer = {
  data: { skills: [{ name: 'org-code-review', title: 'Code review', description: 'Review a change', source: 'every-agent', sourceName: 'Fernhill', detail: '' }] },
  isLoading: false, error: undefined,
}

vi.mock('wasp/client/operations', () => ({
  startConversation: { name: 'startConversation' },
  getProjects: { name: 'getProjects' },
  listStartSkills: { name: 'listStartSkills' },
  useQuery: (op: { name: string }) => op.name === 'listStartSkills'
    ? skillAnswer
    : { data: [{ id: 'p1', isMember: true, myRole: role.value }] },
  useAction: () => startConversation,
}))

import { PlaceComposer, startingAgentId } from '../components/PlaceComposer'
import { testPlace } from './placeFixture'

beforeEach(() => {
  startConversation.mockReset().mockResolvedValue({ conversationId: 'c9', messageId: 'm1' })
  role.value = 'MEMBER'
})

const twoAgents = testPlace({
  agents: [{ id: 'a1', name: 'Project manager', avatarUrl: null }, { id: 'a2', name: 'DevOps', avatarUrl: null }],
  defaultAgentId: 'a2',
})

function renderComposer(place = twoAgents, props: { autoFocus?: boolean } = {}) {
  return render(
    <MemoryRouter initialEntries={['/projects/AGX']}>
      <Routes>
        <Route path="/projects/AGX" element={<PlaceComposer place={place} {...props} />} />
        <Route path="/projects/AGX/t/:id" element={<span>opened the conversation</span>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PlaceComposer @SC-496', () => {
  it('is empty and writable again once the conversation is started, where it stays on screen (the dock)', async () => {
    render(<MemoryRouter initialEntries={['/projects/AGX']}><Routes><Route path="*" element={<PlaceComposer place={twoAgents} />} /></Routes></MemoryRouter>)
    const box = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: 'What next?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(startConversation).toHaveBeenCalled())
    await waitFor(() => expect(box.value).toBe(''))
    expect(box.disabled).toBe(false)
  })

  it("offers a project Viewer no message box, only a line saying they read here and whom to ask (adr-0102)", () => {
    role.value = 'VIEWER'
    renderComposer()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
    expect(screen.getByText(/You're a Viewer here: you can read this project but not change it\. Ask one of its admins/)).toBeTruthy()
  })

  it('starts with the place’s default agent', () => {
    renderComposer()
    expect((screen.getByRole('combobox', { name: 'Agent' }) as HTMLSelectElement).value).toBe('a2')
  })

  it('starts a new conversation here with the picked agent and the message, and opens it', async () => {
    renderComposer()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'What next?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText('opened the conversation')
    expect(startConversation).toHaveBeenCalledWith(expect.objectContaining({ home: 'PROJECT', projectId: 'p1', agentId: 'a2', text: 'What next?' }))
  })

  it('starts one in the person\'s own space when the place is not a project', async () => {
    render(
      <MemoryRouter initialEntries={['/agents/coder']}>
        <Routes>
          <Route path="/agents/coder" element={<PlaceComposer place={{ ...twoAgents, basePath: '/chat', sessionLocation: null }} />} />
          <Route path="/chat/t/:id" element={<span>opened in Chat</span>} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText('opened in Chat')
    const args = startConversation.mock.calls[0][0]
    expect(args).toMatchObject({ home: 'PERSON', agentId: 'a2', text: 'Hello' })
    expect(args).not.toHaveProperty('projectId')
  })

  it('says why it cannot start a conversation, and stays', async () => {
    startConversation.mockRejectedValue(new Error('That agent cannot be talked to here'))
    renderComposer()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('cannot be talked to'))
    expect(screen.queryByText('opened the conversation')).toBeNull()
  })

  it('is closed when the place has no agent to talk to', () => {
    renderComposer(testPlace({ agents: [], defaultAgentId: null }))
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true)
    expect(screen.getByRole('textbox').getAttribute('placeholder')).toBe('Add an agent')
  })
})

describe('PlaceComposer, as the place’s agents and default arrive @SC-496', () => {
  const rerenderWith = (view: ReturnType<typeof renderComposer>, place: typeof twoAgents, props: { autoFocus?: boolean } = {}) =>
    view.rerender(
      <MemoryRouter initialEntries={['/projects/AGX']}>
        <Routes>
          <Route path="/projects/AGX" element={<PlaceComposer place={place} {...props} />} />
        </Routes>
      </MemoryRouter>,
    )

  it('follows the default agent that arrives later, until the person picks one', () => {
    const view = renderComposer({ ...twoAgents, defaultAgentId: null })
    const picker = () => screen.getByRole('combobox', { name: 'Agent' }) as HTMLSelectElement
    expect(picker().value).toBe('a1')

    rerenderWith(view, { ...twoAgents, defaultAgentId: 'a2' })
    expect(picker().value).toBe('a2')

    fireEvent.change(picker(), { target: { value: 'a1' } })
    rerenderWith(view, { ...twoAgents, defaultAgentId: 'a2', agents: [...twoAgents.agents] })
    expect(picker().value).toBe('a1')
  })

  it('takes focus once it can be written in, when asked to', () => {
    const view = renderComposer(testPlace({ agents: [], defaultAgentId: null }), { autoFocus: true })
    expect(document.activeElement).not.toBe(screen.getByRole('textbox'))

    rerenderWith(view, twoAgents, { autoFocus: true })
    expect(document.activeElement).toBe(screen.getByRole('textbox'))
  })
})

describe('startingAgentId @SC-496', () => {
  it('takes the first agent when the default cannot be talked to here', () => {
    expect(startingAgentId({ agents: [{ id: 'a1', name: 'A', avatarUrl: null }], defaultAgentId: 'gone' })).toBe('a1')
  })
})

describe('the / pick in the place\'s box', () => {
  it('leaves /name in the text, highlighted, and sends the skill beside the words without it', async () => {
    renderComposer()
    const box = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: '/' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(box.value).toBe('/org-code-review ')
    expect(screen.getByTestId('skill-mark').textContent).toBe('/org-code-review')
    fireEvent.change(box, { target: { value: '/org-code-review the checkout form' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(startConversation).toHaveBeenCalled())
    expect(startConversation.mock.calls[0]![0]).toMatchObject({ text: 'the checkout form', skill: { name: 'org-code-review' } })
  })

  it('lets the skill go when the mark is changed', async () => {
    renderComposer()
    const box = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: '/' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    fireEvent.change(box, { target: { value: '/org-code hello' } })
    expect(screen.queryByTestId('skill-mark')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(startConversation).toHaveBeenCalled())
    expect(startConversation.mock.calls[0]![0].skill).toBeUndefined()
  })
})
