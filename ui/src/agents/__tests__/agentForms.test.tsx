import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConfigurationTab } from '../tabs/ConfigurationTab'
import { PromptTab } from '../tabs/PromptTab'
import { CreateAgentModal } from '../CreateAgentModal'
import { AgentManageHeader } from '../AgentManageHeader'
import type { AgentDetail } from '../types'

const agent = { id: 'a1', name: 'Kira', handle: 'kira', role: null } as unknown as AgentDetail

describe('Settings', () => {
  it('refuses an empty name', async () => {
    const updateAgent = vi.fn().mockResolvedValue(undefined)
    render(<ConfigurationTab agent={agent} actions={{ updateAgent }} />)
    fireEvent.change(screen.getByDisplayValue('Kira'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    expect(screen.getByText(/needs a name/)).toBeTruthy()
    expect(updateAgent).not.toHaveBeenCalled()
  })

  it('keeps what is typed when the same agent is loaded again', () => {
    const props = { actions: { updateAgent: async () => {} } }
    const { rerender } = render(<ConfigurationTab agent={agent} {...props} />)
    fireEvent.change(screen.getByDisplayValue('Kira'), { target: { value: 'Kira B' } })
    rerender(<ConfigurationTab agent={{ ...agent }} {...props} />)
    expect(screen.getByDisplayValue('Kira B')).toBeTruthy()
  })
})

describe('the instructions editor', () => {
  const slots = { renderMarkdown: ({ content }: { content: string }) => <span>{content}</span>, renderEditor: () => null } as never
  const actions = { updateAgentFile: async () => {} } as never

  it('says so when the instructions cannot be read', async () => {
    const queries = { getAgentPromptPreview: vi.fn().mockRejectedValue(new Error('down')) } as never
    render(<PromptTab agent={agent} queries={queries} actions={actions} slots={slots} />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/Could not load/)
  })

  it('shows only the answer for the mode on screen', async () => {
    let resolveChat: (v: unknown) => void = () => {}
    const getAgentPromptPreview = vi.fn(({ mode }: { mode: string }) =>
      mode === 'chat'
        ? new Promise(r => { resolveChat = r })
        : Promise.resolve({ sections: [{ key: 'identity', label: 'T', content: 'task-mode text', editable: false }] }))
    render(<PromptTab agent={agent} queries={{ getAgentPromptPreview } as never} actions={actions} slots={slots} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Task' }))
    expect(await screen.findByText('task-mode text')).toBeTruthy()
    resolveChat({ sections: [{ key: 'identity', label: 'T', content: 'chat-mode text', editable: false }] })
    await new Promise(r => setTimeout(r, 10))
    expect(screen.queryByText('chat-mode text')).toBeNull()
  })
})

describe('an editable section of the instructions @SC-1908', () => {
  const sections = [
    { key: 'identity', label: 'Identity', content: 'auto text', editable: false },
    { key: 'soul', label: 'Soul', content: 'soul text', editable: true },
  ]
  const queries = { getAgentPromptPreview: vi.fn().mockResolvedValue({ sections }) } as never
  const renderEditor = vi.fn(() => <div>editing</div>)
  const slots = { renderMarkdown: ({ content }: { content: string }) => <span>{content}</span>, renderEditor } as never

  it('is a tab stop, and Enter on it opens it for editing; a read-only one is not', async () => {
    render(<PromptTab agent={agent} queries={queries} actions={{ updateAgentFile: async () => {} } as never} slots={slots} />)
    const section = await screen.findByRole('button', { name: 'Edit Soul' })
    expect(section.tabIndex).toBe(0)
    expect(screen.queryByRole('button', { name: 'Edit Identity' })).toBeNull()
    section.focus()
    expect(document.activeElement).toBe(section)
    fireEvent.keyDown(section, { key: 'Enter' })
    await waitFor(() => expect(renderEditor).toHaveBeenCalled())
  })
})

describe('the new-agent form', () => {
  it('is a dialog whose labels belong to their inputs, and Escape closes it', () => {
    const onClose = vi.fn()
    render(<CreateAgentModal open onClose={onClose} defaultSiteId="s1" actions={{ createAgent: vi.fn() } as never} />)
    expect(screen.getByRole('dialog', { name: 'New Agent' })).toBeTruthy()
    expect(screen.getByLabelText('Name')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

describe('the agent header', () => {
  const header = (over = {}) => render(
    <AgentManageHeader
      agent={{ id: 'a1', name: 'Kira', handle: 'kira', role: null, avatarUrl: null, coverUrl: null }}
      actions={{ saveName: async () => {}, saveRole: async () => {}, fetchPresets: async () => [], applyAgentPreset: async () => ({ url: 'x' }), ...over }}
    />,
  )

  it('does not mention an internal folder when there are no presets', async () => {
    header()
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    await waitFor(() => expect(screen.getByText(/No ready-made avatars/)).toBeTruthy())
    expect(document.body.textContent).not.toMatch(/kernel\/presets/)
  })

  it('refuses to rename an agent to nothing', async () => {
    const saveName = vi.fn()
    header({ saveName })
    fireEvent.click(screen.getByText('Kira'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: ' ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/needs a name/)
    expect(saveName).not.toHaveBeenCalled()
  })

  it('says so when a ready-made image cannot be applied', async () => {
    header({ fetchPresets: async () => ['a.png'], applyAgentPreset: () => Promise.reject(new Error('no')) })
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    fireEvent.click(await screen.findByRole('button', { name: 'a.png' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Could not use that image/)
  })
})
