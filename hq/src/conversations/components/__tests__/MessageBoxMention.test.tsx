// @vitest-environment jsdom
/**
 * Spec part 3, *Chips in conversations*: Mention puts the chip inside the message box at the caret, as one piece, with
 * text typed either side; a path typed or pasted becomes a chip; the box sends the same text as before, paths as text.
 */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { mentionInMessage } from '@agenthix/ui/sessions'

vi.mock('wasp/client/operations', () => ({ getSpeechToken: vi.fn(), reportSpeechSession: vi.fn() }))

import { MessageBox } from '../MessageBox'
import { caretAt, fieldOf, typeInto, valueOf } from './messageFieldHelpers'

afterEach(cleanup)

const LABEL = 'Message Kernel…'

function box() {
  const onSend = vi.fn(async () => true)
  render(<MessageBox placeholder={LABEL} running={false} sending={false} onSend={onSend} onStop={vi.fn()} takesMentions />)
  return { onSend }
}
const mention = (path: string) => act(() => { mentionInMessage(path) })
const chips = () => within(fieldOf(LABEL)).queryAllByRole('img').map((c) => c.getAttribute('aria-label'))
const send = () => fireEvent.click(screen.getByRole('button', { name: 'Send' }))

function paste(text: string) {
  const data = { getData: (type: string) => (type === 'text/plain' ? text : '<b>html</b>') }
  fireEvent.paste(fieldOf(LABEL), { clipboardData: data })
}

describe('Mention in the message box @SC-1543', () => {
  it('puts the chip where the caret is, between the words typed either side', () => {
    box()
    typeInto(LABEL, 'Compare with last year')
    caretAt(LABEL, 'Compare'.length)
    mention('files/e2e-files/notes.md')
    expect(valueOf(LABEL)).toBe('Compare files/e2e-files/notes.md with last year')
    expect(chips()).toEqual(['notes.md'])
    expect(document.activeElement).toBe(fieldOf(LABEL))
  })

  it('goes at the end of the text when the box was never focused, and the caret follows it', () => {
    box()
    mention('files/a.md')
    mention('files/b.csv')
    expect(valueOf(LABEL)).toBe('files/a.md files/b.csv ')
    expect(chips()).toEqual(['a.md', 'b.csv'])
  })

  it('takes text typed after the chip', () => {
    box()
    mention('files/a.md')
    typeInto(LABEL, `${valueOf(LABEL)}please`)
    expect(valueOf(LABEL)).toBe('files/a.md please')
  })

  it('deletes the chip whole with one Backspace, and only the chip', () => {
    box()
    typeInto(LABEL, 'See files/reports/q3.pdf now')
    expect(chips()).toEqual(['q3.pdf'])
    caretAt(LABEL, 'See files/reports/q3.pdf'.length)
    fireEvent.keyDown(fieldOf(LABEL), { key: 'Backspace' })
    expect(valueOf(LABEL)).toBe('See  now')
    expect(chips()).toEqual([])
  })

  it('deletes the chip after the caret whole with Delete', () => {
    box()
    typeInto(LABEL, 'See files/q3.pdf now')
    caretAt(LABEL, 'See '.length)
    fireEvent.keyDown(fieldOf(LABEL), { key: 'Delete' })
    expect(valueOf(LABEL)).toBe('See  now')
  })

  it('sends exactly the text, the paths written out', async () => {
    const { onSend } = box()
    typeInto(LABEL, 'Check ')
    mention('files/reports/q3.pdf')
    typeInto(LABEL, `${valueOf(LABEL)}against artefacts/plan.md.`)
    send()
    await vi.waitFor(() => expect(onSend).toHaveBeenCalledWith('Check files/reports/q3.pdf against artefacts/plan.md.'))
    await vi.waitFor(() => expect(valueOf(LABEL)).toBe(''))
    expect(chips()).toEqual([])
  })
})

describe('a path typed or pasted into the box @SC-1544', () => {
  it('becomes a chip once something follows it, not while it is being typed', () => {
    box()
    typeInto(LABEL, 'files/reports/q3')
    expect(chips()).toEqual([])
    typeInto(LABEL, 'files/reports/q3.pdf ')
    expect(chips()).toEqual(['q3.pdf'])
    expect(valueOf(LABEL)).toBe('files/reports/q3.pdf ')
  })

  it('becomes a chip at once when pasted, and only plain text goes in', () => {
    box()
    typeInto(LABEL, 'Look at ')
    paste('files/data/sales.csv')
    expect(valueOf(LABEL)).toBe('Look at files/data/sales.csv')
    expect(chips()).toEqual(['sales.csv'])
    expect(fieldOf(LABEL).querySelector('b')).toBeNull()
  })

  it('becomes a chip when the box loses the focus', () => {
    box()
    typeInto(LABEL, 'files/a.md')
    expect(chips()).toEqual([])
    fireEvent.blur(fieldOf(LABEL))
    expect(chips()).toEqual(['a.md'])
  })

  it('stays text when it names no file', () => {
    box()
    typeInto(LABEL, 'files/ and notes/today.md ')
    expect(chips()).toEqual([])
  })
})

describe('the box as a text field @SC-1544', () => {
  it('breaks a line with Shift+Enter and sends with Enter', async () => {
    const { onSend } = box()
    typeInto(LABEL, 'One')
    fireEvent.keyDown(fieldOf(LABEL), { key: 'Enter', shiftKey: true })
    typeInto(LABEL, `${valueOf(LABEL)}two`)
    expect(valueOf(LABEL)).toBe('One\ntwo')
    fireEvent.keyDown(fieldOf(LABEL), { key: 'Enter' })
    await vi.waitFor(() => expect(onSend).toHaveBeenCalledWith('One\ntwo'))
  })

  it('does not send on Enter while a word is being composed', () => {
    const { onSend } = box()
    typeInto(LABEL, 'にほん')
    fireEvent.compositionStart(fieldOf(LABEL))
    fireEvent.keyDown(fieldOf(LABEL), { key: 'Enter' })
    fireEvent.compositionEnd(fieldOf(LABEL))
    expect(onSend).not.toHaveBeenCalled()
  })

  it('copies the paths, not the chips’ labels', () => {
    box()
    typeInto(LABEL, 'See files/q3.pdf now')
    const field = fieldOf(LABEL)
    const range = document.createRange()
    range.selectNodeContents(field)
    document.getSelection()!.removeAllRanges()
    document.getSelection()!.addRange(range)
    const setData = vi.fn()
    fireEvent.copy(field, { clipboardData: { setData } })
    expect(setData).toHaveBeenCalledWith('text/plain', 'See files/q3.pdf now')
  })

  it('keeps its role and label, and shows the placeholder only while empty', () => {
    box()
    const field = screen.getByRole('textbox', { name: LABEL })
    expect(field.getAttribute('aria-multiline')).toBe('true')
    expect(screen.getByText(LABEL)).toBeTruthy()
    typeInto(LABEL, 'Hi')
    expect(screen.queryByText(LABEL)).toBeNull()
  })
})
