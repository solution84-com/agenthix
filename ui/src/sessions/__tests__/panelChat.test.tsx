import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { PanelChatComposer } from '../PanelChatComposer'
import { PanelChatView, type PanelChatViewActions, type PanelChatViewQueries } from '../PanelChatView'
import type { SessionDetail } from '../types'

afterEach(() => { cleanup(); vi.useRealTimers() })

// jsdom has no ResizeObserver; the view only uses it to keep the thread pinned to the bottom.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver

describe('the panel message box @SC-1934', () => {
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

const session = { id: 's1', entries: [], model: null, agent: { name: 'Kernel' } } as unknown as SessionDetail
const queries = (getSession = vi.fn().mockResolvedValue(session)): PanelChatViewQueries => ({
  getSession,
  getSessionPendingManifest: vi.fn().mockResolvedValue(null),
})
const actions = (over: Partial<PanelChatViewActions> = {}) => ({
  triggerAgentRun: vi.fn().mockResolvedValue({ id: 'r1' }),
  cancelAgentRun: vi.fn().mockResolvedValue(undefined),
  updateSession: vi.fn().mockResolvedValue(undefined),
  ...over,
}) as unknown as PanelChatViewActions

async function type(words: string) {
  const box = await screen.findByRole('textbox')
  fireEvent.change(box, { target: { value: words } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  return box as HTMLTextAreaElement
}

describe('the panel view', () => {
  it('a first read that keeps failing is a nudge in place of the conversation, with Try again, never a dialog', async () => {
    vi.useFakeTimers()
    const getSession = vi.fn().mockRejectedValue(new Error('down'))
    render(<PanelChatView sessionId="s1" socket={null} queries={queries(getSession)} actions={actions()} />)
    // Nothing during the retries.
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(screen.queryByRole('status')).toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(getSession).toHaveBeenCalledTimes(4)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('status').textContent).toMatch(/The conversation could not be read/)
    expect(screen.queryByText(/Start a conversation/)).toBeNull()
    getSession.mockResolvedValue(session)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByText(/Start a conversation with Kernel/)).toBeTruthy()
  })

  it("another conversation's thread is not held when the next conversation's first read fails", async () => {
    vi.useFakeTimers()
    const other = { ...session, id: 's2', entries: [{ id: 'e1', kind: 'MESSAGE', role: 'USER', content: 'from the first conversation', createdAt: new Date().toISOString() }] } as unknown as SessionDetail
    const getSession = vi.fn().mockResolvedValueOnce(other).mockRejectedValue(new Error('down'))
    const { rerender } = render(<PanelChatView sessionId="s1" socket={null} queries={queries(getSession)} actions={actions()} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.queryByRole('status')).toBeNull()
    rerender(<PanelChatView sessionId="s2" socket={null} queries={queries(getSession)} actions={actions()} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(screen.getByRole('status').textContent).toMatch(/The conversation could not be read/)
    expect(screen.queryByText('from the first conversation')).toBeNull()
    vi.useRealTimers()
  })

  it('a message not sent stays in the box with "Not sent · Send again", not a dialog', async () => {
    const triggerAgentRun = vi.fn().mockRejectedValueOnce(new Error('HQ did not answer.')).mockResolvedValue({ id: 'r1' })
    render(<PanelChatView sessionId="s1" socket={null} queries={queries()} actions={actions({ triggerAgentRun })} />)
    const box = await type('Add a line about the voice sounds')
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Not sent: HQ did not answer/))
    expect(box.value).toBe('Add a line about the voice sounds')
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Send again' }))
    await waitFor(() => expect(screen.queryByText(/Not sent/)).toBeNull())
    expect(triggerAgentRun).toHaveBeenLastCalledWith({ sessionId: 's1', inputText: 'Add a line about the voice sounds' })
  })

  it('a message accepted while the agent works, whose re-read fails, is never "Not sent"', async () => {
    const getSession = vi.fn().mockResolvedValueOnce(session).mockRejectedValue(new Error('down'))
    const triggerAgentRun = vi.fn().mockResolvedValue({ id: 'r1' })
    render(<PanelChatView sessionId="s1" socket={null} queries={queries(getSession)} actions={actions({ triggerAgentRun })} />)
    await type('first') // the agent is now working on it
    await screen.findByRole('button', { name: 'Stop' })
    const box = await type('second')
    await waitFor(() => expect(triggerAgentRun).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(getSession).toHaveBeenCalledTimes(2))
    expect(screen.queryByText(/Not sent/)).toBeNull()
    expect(box.value).toBe('')
  })

  it("Stop that fails is a line in the thread with Try again; it goes when Stop next works", async () => {
    const cancelAgentRun = vi.fn().mockRejectedValueOnce(new Error('HQ did not answer.')).mockResolvedValue(undefined)
    render(<PanelChatView sessionId="s1" socket={null} queries={queries()} actions={actions({ cancelAgentRun })} />)
    await type('go')
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/The reply could not be stopped: HQ did not answer/))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByText(/could not be stopped/)).toBeNull())
    expect(cancelAgentRun).toHaveBeenCalledTimes(2)
  })
})
