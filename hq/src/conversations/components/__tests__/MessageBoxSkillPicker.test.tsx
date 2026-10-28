// @vitest-environment jsdom
/**
 * Skills spec part 5, *Picking a skill*: `/` at the start of the message box opens a picker of the conversation's agent's
 * skills, narrowed as the person types; choosing one leaves `/name` in the text, highlighted, and the skill is
 * sent beside the text, never parsed from it; changing the mark lets the skill go. A `/` anywhere else is text.
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const query = vi.hoisted(() => ({ skills: [] as unknown[], answer: { data: { skills: [] as unknown[] }, isLoading: false, error: undefined } }))

vi.mock('wasp/client/operations', () => ({
  getSpeechToken: vi.fn(),
  reportSpeechSession: vi.fn(),
  findConversationFiles: { name: 'findConversationFiles' },
  listConversationSkills: { name: 'listConversationSkills' },
  useQuery: (op: { name: string }) => {
    if (op.name === 'listConversationSkills') return query.answer
    return { data: { places: [] }, isLoading: false, isFetching: false }
  },
}))

import { MessageBox } from '../MessageBox'
import { fieldOf, typeInto, valueOf } from './messageFieldHelpers'

const LABEL = 'Message Kernel…'
const skill = (name: string, title: string, source: string, sourceName: string, description = '') =>
  ({ name, title, description, source, sourceName, detail: `${name} tag` })

class FakeHighlight {
  ranges: Range[]
  constructor(...ranges: Range[]) { this.ranges = ranges }
}

beforeEach(() => {
  vi.stubGlobal('Highlight', FakeHighlight)
  ;(globalThis as unknown as { CSS: object }).CSS = { highlights: new Map() }
  query.skills = [
    skill('platform-git', 'Working with git', 'builtin', 'Built in', 'Branch and commit'),
    skill('org-code-review', 'Code review', 'every-agent', 'Fernhill', 'Review a change'),
    skill('person-notes', 'My review notes', 'yours', 'Yours', 'Short, numbered'),
  ]
  // Stable between renders, as the real query's data is.
  query.answer = { data: { skills: query.skills }, isLoading: false, error: undefined }
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function box(props: Partial<React.ComponentProps<typeof MessageBox>> = {}) {
  const onSend = vi.fn(async (_text: string, _skill?: { name: string }) => true)
  render(<MessageBox placeholder={LABEL} running={false} sending={false} onSend={onSend} onStop={vi.fn()} takesMentions takesSkills conversationId="c1" {...props} />)
  return { onSend }
}
const listbox = () => screen.queryByRole('listbox', { name: 'Skills' })
const options = () => within(listbox()!).getAllByRole('option')
const key = (k: string, init: Partial<KeyboardEventInit> = {}) => fireEvent.keyDown(fieldOf(LABEL), { key: k, ...init })
const chip = () => screen.queryByTestId('skill-chip')
/** What the browser's text highlight paints now (jsdom has none, so the test brings a small one). */
const highlighted = () => [...((CSS as unknown as { highlights: Map<string, { ranges: Range[] }> }).highlights.get('skill-pick')?.ranges ?? [])].map(r => r.toString())

describe('the / picker @SC-1657', () => {
  it('opens for a / at the start with the agent\'s skills in groups, the field keeping the focus', () => {
    box()
    typeInto(LABEL, '/')
    expect(options().map(o => o.textContent)).toEqual(['Working with gitBranch and commit', 'Code reviewReview a change', 'My review notesShort, numbered'])
    expect(screen.getAllByRole('presentation').map(h => h.textContent)).toEqual(['Built in', 'Fernhill', 'Yours'])
    expect(document.activeElement).toBe(fieldOf(LABEL))
    expect(fieldOf(LABEL).getAttribute('aria-controls')).toBe(listbox()!.id)
  })

  it('does not open for a / later in the message, inside a word, or after a space', () => {
    box()
    for (const text of ['see src/', 'and/', ' /', 'hello /']) {
      typeInto(LABEL, text)
      expect(screen.queryByTestId('skill-picker')).toBeNull()
    }
  })

  it('does not open without takesSkills or a conversation', () => {
    box({ takesSkills: false })
    typeInto(LABEL, '/')
    expect(screen.queryByTestId('skill-picker')).toBeNull()
    cleanup()
    box({ conversationId: undefined })
    typeInto(LABEL, '/')
    expect(screen.queryByTestId('skill-picker')).toBeNull()
  })

  it('narrows as the person types, on name and description', () => {
    box()
    typeInto(LABEL, '/rev')
    expect(options().map(o => o.textContent)).toEqual(['Code reviewReview a change', 'My review notesShort, numbered'])
    typeInto(LABEL, '/branch')
    expect(options().map(o => o.textContent)).toEqual(['Working with gitBranch and commit'])
    typeInto(LABEL, '/zzz')
    expect(screen.getByText('No skill matches “zzz”')).toBeTruthy()
  })

  it('chooses with Enter: /name stays in the text, highlighted where it was typed, and nothing is sent', () => {
    const { onSend } = box()
    typeInto(LABEL, '/rev')
    key('ArrowDown')
    key('Enter')
    expect(valueOf(LABEL)).toBe('/person-notes ')
    expect(fieldOf(LABEL).getAttribute('data-picked-skill')).toBe('/person-notes')
    expect(highlighted()).toEqual(['/person-notes'])
    expect(chip()).toBeNull()
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.queryByTestId('skill-picker')).toBeNull()
  })

  it('chooses with Tab and with a click', () => {
    box()
    typeInto(LABEL, '/')
    key('Tab')
    expect(valueOf(LABEL)).toBe('/platform-git ')
    cleanup()
    box()
    typeInto(LABEL, '/')
    fireEvent.click(options()[1]!)
    expect(valueOf(LABEL)).toBe('/org-code-review ')
    expect(highlighted()).toEqual(['/org-code-review'])
  })

  it('sends the skill beside the text, which stays the person\'s words without the mark', async () => {
    const { onSend } = box()
    typeInto(LABEL, '/code')
    key('Enter')
    typeInto(LABEL, '/org-code-review the checkout form changes')
    expect(highlighted()).toEqual(['/org-code-review'])
    key('Enter')
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('the checkout form changes', { name: 'org-code-review' }))
    await waitFor(() => expect(valueOf(LABEL)).toBe(''))
    expect(highlighted()).toEqual([])
  })

  it('sends no skill when none was chosen, and a typed /word is plain text, not highlighted', async () => {
    const { onSend } = box()
    typeInto(LABEL, '/update-config please')
    expect(highlighted()).toEqual([])
    key('Enter')
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('/update-config please'))
  })

  it('keeps the pick when sending is refused', async () => {
    const onSend = vi.fn(async () => false)
    box({ onSend })
    typeInto(LABEL, '/code')
    key('Enter')
    typeInto(LABEL, '/org-code-review hello')
    key('Enter')
    await waitFor(() => expect(onSend).toHaveBeenCalled())
    expect(highlighted()).toEqual(['/org-code-review'])
    expect(valueOf(LABEL)).toBe('/org-code-review hello')
  })

  it('lets the skill go when its text is changed or deleted, and typing the same name again does not pick it again', async () => {
    const { onSend } = box()
    typeInto(LABEL, '/code')
    key('Enter')
    typeInto(LABEL, '/org-code-revie hello')
    expect(highlighted()).toEqual([])
    typeInto(LABEL, '/org-code-review hello')
    expect(highlighted()).toEqual([])
    key('Enter')
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('/org-code-review hello'))
  })

  it('lets the skill go when the whole text is deleted, and opens no second picker while one skill is picked', () => {
    box()
    typeInto(LABEL, '/code')
    key('Enter')
    typeInto(LABEL, '/org-code-review hello /')
    expect(screen.queryByTestId('skill-picker')).toBeNull()
    typeInto(LABEL, '')
    expect(highlighted()).toEqual([])
    expect(fieldOf(LABEL).getAttribute('data-picked-skill')).toBeNull()
  })

  it('closes on Escape and leaves the text', () => {
    box()
    typeInto(LABEL, '/co')
    key('Escape')
    expect(screen.queryByTestId('skill-picker')).toBeNull()
    expect(valueOf(LABEL)).toBe('/co')
  })
})
