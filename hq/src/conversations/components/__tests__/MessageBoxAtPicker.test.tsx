// @vitest-environment jsdom
/**
 * Spec part 3, *Chips in conversations*: `@` in the message box opens a picker of the conversation's files, narrowed as
 * the person types; the keys or a click choose one, which replaces the `@…` with its chip; Escape or a space closes it.
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

type Answer = { data?: { places: unknown[] }; isLoading: boolean; isFetching: boolean }
const query = vi.hoisted(() => ({ answers: new Map<string, Answer>(), calls: [] as string[] }))

vi.mock('wasp/client/operations', () => ({
  getSpeechToken: vi.fn(),
  reportSpeechSession: vi.fn(),
  findConversationFiles: { name: 'findConversationFiles' },
  useQuery: (_op: unknown, args: { conversationId: string; fragment: string }) => {
    query.calls.push(args.fragment)
    return query.answers.get(args.fragment) ?? { data: undefined, isLoading: true, isFetching: true }
  },
}))

import { MessageBox } from '../MessageBox'
import { fieldOf, typeInto, valueOf } from './messageFieldHelpers'

const LABEL = 'Message Kernel…'
const file = (reference: string) => ({ reference, name: reference.split('/').pop()!, folder: reference.split('/').slice(0, -1).join('/'), modifiedAt: '2026-10-01T00:00:00.000Z' })
const found = (...references: string[]): Answer =>
  ({ data: { places: [{ name: 'Shop', state: 'ready', truncated: false, files: references.map(file) }] }, isLoading: false, isFetching: false })

beforeEach(() => {
  query.answers.clear()
  query.calls = []
  query.answers.set('', found('files/recent.md'))
  query.answers.set('q', found('files/reports/q3.pdf', 'files/q4.csv'))
})
afterEach(cleanup)

function box(props: Partial<React.ComponentProps<typeof MessageBox>> = {}) {
  const onSend = vi.fn(async () => true)
  render(<MessageBox placeholder={LABEL} running={false} sending={false} onSend={onSend} onStop={vi.fn()} takesMentions conversationId="c1" {...props} />)
  return { onSend }
}
const listbox = () => screen.queryByRole('listbox', { name: 'Files to mention' })
const options = () => within(listbox()!).getAllByRole('option')
const key = (k: string, init: Partial<KeyboardEventInit> = {}) => fireEvent.keyDown(fieldOf(LABEL), { key: k, ...init })
const chips = () => within(fieldOf(LABEL)).queryAllByRole('img').map((c) => c.getAttribute('aria-label'))

describe('the @ picker @SC-1545', () => {
  it('opens when @ is typed at a word start, with the most recent files under a heading, and the field keeps the focus', async () => {
    box()
    typeInto(LABEL, 'Look at @')
    await waitFor(() => expect(options().map((o) => o.textContent)).toEqual(['recent.mdfiles']))
    expect(screen.getByText('Files')).toBeTruthy()
    const field = fieldOf(LABEL)
    expect(document.activeElement).toBe(field)
    expect(field.getAttribute('aria-controls')).toBe(listbox()!.id)
    expect(field.getAttribute('aria-activedescendant')).toBe(options()[0]!.id)
    expect(options()[0]!.getAttribute('aria-selected')).toBe('true')
  })

  it('does not open for an @ inside a word', () => {
    box()
    typeInto(LABEL, 'mail me@')
    expect(screen.queryByTestId('at-picker')).toBeNull()
  })

  it('narrows as the person types, asking once the typing rests', async () => {
    box()
    typeInto(LABEL, '@')
    typeInto(LABEL, '@q')
    await waitFor(() => expect(options()).toHaveLength(2))
    expect(query.calls.at(-1)).toBe('q')
    expect(screen.getByText('files/reports')).toBeTruthy()
  })

  it('moves with the arrow keys and chooses with Enter: the @… becomes the chip, and nothing is sent', async () => {
    const { onSend } = box()
    typeInto(LABEL, 'compare @q')
    await waitFor(() => expect(options()).toHaveLength(2))
    key('ArrowDown')
    expect(options()[1]!.getAttribute('aria-selected')).toBe('true')
    expect(fieldOf(LABEL).getAttribute('aria-activedescendant')).toBe(options()[1]!.id)
    key('ArrowDown')
    expect(options()[0]!.getAttribute('aria-selected')).toBe('true')
    key('ArrowUp')
    key('Enter')
    expect(valueOf(LABEL)).toBe('compare files/q4.csv ')
    expect(chips()).toEqual(['q4.csv'])
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.queryByTestId('at-picker')).toBeNull()
  })

  it('chooses with Tab, and with a click', async () => {
    box()
    typeInto(LABEL, '@q')
    await waitFor(() => expect(options()).toHaveLength(2))
    key('Tab')
    expect(valueOf(LABEL)).toBe('files/reports/q3.pdf ')
    typeInto(LABEL, `${valueOf(LABEL)}and @q`)
    await waitFor(() => expect(options()).toHaveLength(2))
    fireEvent.click(options()[1]!)
    expect(valueOf(LABEL)).toBe('files/reports/q3.pdf and files/q4.csv ')
    expect(chips()).toEqual(['q3.pdf', 'q4.csv'])
  })

  it('closes on Escape and leaves the text, until another @ is typed', async () => {
    box()
    typeInto(LABEL, 'hi @q')
    await waitFor(() => expect(listbox()).toBeTruthy())
    key('Escape')
    expect(screen.queryByTestId('at-picker')).toBeNull()
    expect(valueOf(LABEL)).toBe('hi @q')
    typeInto(LABEL, 'hi @q @')
    await waitFor(() => expect(listbox()).toBeTruthy())
  })

  it('closes when a space ends the word', async () => {
    box()
    typeInto(LABEL, '@q')
    await waitFor(() => expect(listbox()).toBeTruthy())
    typeInto(LABEL, '@q ')
    expect(screen.queryByTestId('at-picker')).toBeNull()
  })

  it('says when it is finding, when nothing matches, and and says nothing of a place that is not answering', async () => {
    box()
    typeInto(LABEL, '@zz')
    await waitFor(() => expect(screen.getByText('Finding files…')).toBeTruthy())
    query.answers.set('zzz', { data: { places: [{ name: 'Shop', state: 'ready', truncated: false, files: [] }] }, isLoading: false, isFetching: false })
    typeInto(LABEL, '@zzz')
    await waitFor(() => expect(screen.getByText('No files match “zzz”')).toBeTruthy())
    query.answers.set('w', { data: { places: [{ name: 'Shop', state: 'not-answering', truncated: false, files: [] }] }, isLoading: false, isFetching: false })
    typeInto(LABEL, '@w')
    await waitFor(() => expect(screen.getByText('No files match “w”')).toBeTruthy())
    expect(screen.queryByText(/isn’t answering/)).toBeNull()
  })

  it('lets Enter send when there is nothing to choose', async () => {
    const { onSend } = box()
    query.answers.set('none', { data: { places: [] }, isLoading: false, isFetching: false })
    typeInto(LABEL, 'ping @none')
    await waitFor(() => expect(screen.getByText('No files match “none”')).toBeTruthy())
    await act(async () => { key('Enter') })
    expect(onSend).toHaveBeenCalledWith('ping @none')
  })

  it('is not there in a box that takes no mentions, or with no conversation', () => {
    box({ takesMentions: false })
    typeInto(LABEL, '@')
    expect(screen.queryByTestId('at-picker')).toBeNull()
    cleanup()
    box({ conversationId: undefined })
    typeInto(LABEL, '@')
    expect(screen.queryByTestId('at-picker')).toBeNull()
  })
})
