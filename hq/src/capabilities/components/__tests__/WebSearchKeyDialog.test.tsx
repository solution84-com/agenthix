// @vitest-environment jsdom
/** The "Web search for OpenCode" pop-up: what it says, a saved key, a refused key, a save that fails, Remove key. */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const h = vi.hoisted(() => ({ save: vi.fn(), remove: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  setWebSearchKey: 'setWebSearchKey', deleteWebSearchKey: 'deleteWebSearchKey',
  useAction: (op: string) => (op === 'setWebSearchKey' ? h.save : h.remove),
}))

import { EXA_KEY_PAGE, WebSearchKeyDialog } from '../WebSearchKeyDialog'

const refusal = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode })
const typeKey = (value: string) => fireEvent.change(screen.getByLabelText(/Exa API key/), { target: { value } })

beforeEach(() => { h.save.mockReset().mockResolvedValue({ ok: true }); h.remove.mockReset().mockResolvedValue({ ok: true }) })
afterEach(cleanup)

describe('the Web search for OpenCode pop-up', () => {
  it('says what the key is for, that it stays in HQ, that Claude Code does not need it, and links to Exa', () => {
    render(<WebSearchKeyDialog open stored={false} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Web search for OpenCode' })).toBeTruthy()
    expect(screen.getByText(/The key stays in HQ and\s+never reaches an agent/)).toBeTruthy()
    expect(screen.getByText(/like Claude Code, don’t need it/)).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Get one from Exa ↗' })
    expect(link.getAttribute('href')).toBe(EXA_KEY_PAGE)
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.queryByRole('button', { name: 'Remove key' })).toBeNull()
  })

  it('saves the key through setWebSearchKey and closes', async () => {
    const onClose = vi.fn()
    render(<WebSearchKeyDialog open stored={false} onClose={onClose} />)
    typeKey('exa-123')
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(h.save).toHaveBeenCalledWith({ secret: 'exa-123' })
  })

  it('Not now closes it without saving', () => {
    const onClose = vi.fn()
    render(<WebSearchKeyDialog open stored={false} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(onClose).toHaveBeenCalled()
    expect(h.save).not.toHaveBeenCalled()
  })

  it('says a refused key under the field and stays open', async () => {
    h.save.mockRejectedValue(refusal('That key was refused', 400))
    const onClose = vi.fn()
    render(<WebSearchKeyDialog open stored={false} onClose={onClose} />)
    typeKey('bad')
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))
    expect(await screen.findByText('That key was refused')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('says a save that failed for another reason in the attention dialog, in words, and stays open', async () => {
    h.save.mockRejectedValue(Object.assign(new Error('Request failed due to a network error: POST http://localhost:4101/operations/set-web-search-key'), { name: 'NetworkError' }))
    const onClose = vi.fn()
    render(<WebSearchKeyDialog open stored={false} onClose={onClose} />)
    typeKey('exa-123')
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))
    expect(await screen.findByText('The key was not saved')).toBeTruthy()
    expect(screen.getByText('HQ did not answer.')).toBeTruthy()
    expect(screen.queryByText(/localhost/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('says a key Exa refused under the field, and does not save it', async () => {
    const words = 'Exa refused this key. Check that you copied all of it and that the account has credit, then try again.'
    h.save.mockRejectedValue(Object.assign(new Error(words), { statusCode: 422, data: { message: words, data: { code: 'refused_by_vendor' } } }))
    const onClose = vi.fn()
    render(<WebSearchKeyDialog open stored={false} onClose={onClose} />)
    typeKey('exa-wrong')
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))
    expect(await screen.findByText(words)).toBeTruthy()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('when Exa did not answer, says the key could not be checked and offers Save without checking', async () => {
    const words = 'Exa did not answer, so the key could not be checked.'
    h.save.mockRejectedValueOnce(Object.assign(new Error(words), { statusCode: 502, data: { message: words, data: { code: 'not_checked' } } }))
    const onClose = vi.fn()
    render(<WebSearchKeyDialog open stored={false} onClose={onClose} />)
    typeKey('exa-123')
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))
    expect(await screen.findByText('The key was not checked')).toBeTruthy()
    expect(screen.getByText(words)).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save without checking' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(h.save.mock.calls).toEqual([[{ secret: 'exa-123' }], [{ secret: 'exa-123', unchecked: true }]])
  })

  it('with a key saved, says so without showing it, takes a replacement and offers Remove key', async () => {
    const onClose = vi.fn()
    render(<WebSearchKeyDialog open stored onClose={onClose} />)
    expect(screen.getByText(/A key is saved. It is never shown again/)).toBeTruthy()
    expect((screen.getByLabelText('New Exa API key') as HTMLInputElement).value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Remove key' }))
    expect(h.remove).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Remove the key' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(h.remove).toHaveBeenCalled()
  })

  it('asks before removing the key, and Cancel keeps it', async () => {
    render(<WebSearchKeyDialog open stored onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove key' }))
    expect(await screen.findByText('Remove the search key?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(h.remove).not.toHaveBeenCalled()
    expect(screen.queryByText('Remove the search key?')).toBeNull()
  })

  it('says a removal that failed in the attention dialog', async () => {
    h.remove.mockRejectedValue(Object.assign(new Error('Request failed with status code 500 Internal Server Error'), { statusCode: 500 }))
    render(<WebSearchKeyDialog open stored onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove key' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove the key' }))
    expect(await screen.findByText('The key was not removed')).toBeTruthy()
    expect(screen.getByText('Something went wrong in HQ.')).toBeTruthy()
  })
})
