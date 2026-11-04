import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { PanelChatComposer } from '../PanelChatComposer'
import { PanelChatView, type PanelChatViewActions, type PanelChatViewQueries } from '../PanelChatView'

describe('the panel message box', () => {
  const box = (onSend: () => void) => {
    render(
      <PanelChatComposer
        inputText="こん" onInputChange={() => {}} onSend={onSend} onStop={() => {}} textareaRef={createRef()}
        isSending={false} agentRuntime="claude-code" currentModel="" onModelChange={() => {}}
      />,
    )
    return screen.getByRole('textbox')
  }

  it('does not send when Enter confirms an input-method composition', () => {
    const onSend = vi.fn()
    fireEvent.keyDown(box(onSend), { key: 'Enter', isComposing: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('sends on a plain Enter', () => {
    const onSend = vi.fn()
    fireEvent.keyDown(box(onSend), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledTimes(1)
  })
})

describe('the panel view', () => {
  it('says so when the conversation cannot be loaded, instead of showing an empty one', async () => {
    const queries: PanelChatViewQueries = {
      getSession: vi.fn().mockRejectedValue(new Error('down')),
      getSessionPendingManifest: vi.fn().mockResolvedValue(null),
    }
    render(<PanelChatView sessionId="s1" socket={null} queries={queries} actions={{} as PanelChatViewActions} />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/Could not load this conversation/)
    expect(screen.queryByText(/Start a conversation/)).toBeNull()
  })
})
