// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('wasp/client/operations', () => ({ getSpeechToken: vi.fn() }))

import { MessageBox, type MessageBoxVoice } from '../MessageBox'
import { fieldOf, typeInto, valueOf } from './messageFieldHelpers'

afterEach(cleanup)

const voice = (over: Partial<MessageBoxVoice> = {}): MessageBoxVoice => ({
  available: true, reason: null, heldByOther: false, inVoice: false, speaker: 'none', muted: false,
  onStart: vi.fn(), onEnd: vi.fn(), onMute: vi.fn(), ...over,
})

function box(props: Partial<React.ComponentProps<typeof MessageBox>> = {}) {
  const onSend = vi.fn(async () => true)
  const onStop = vi.fn()
  render(<MessageBox placeholder="Message Kernel…" running={false} sending={false} onSend={onSend} onStop={onStop} voice={voice()} {...props} />)
  return { onSend, onStop }
}
const type = (text: string) => typeInto('Message Kernel…', text)

describe('the pill’s one right button @SC-1007', () => {
  it('starts voice when the box is empty', () => {
    const v = voice()
    box({ voice: v })
    fireEvent.click(screen.getByRole('button', { name: 'Start voice' }))
    expect(v.onStart).toHaveBeenCalled()
  })

  it('sends when the box has text, and clears the box', async () => {
    const { onSend } = box()
    type('Hello there')
    expect(screen.queryByRole('button', { name: 'Start voice' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await vi.waitFor(() => expect(onSend).toHaveBeenCalledWith('Hello there'))
    await vi.waitFor(() => expect(valueOf('Message Kernel…')).toBe(''))
  })

  it('stops while a reply runs and the box is empty', () => {
    const { onStop } = box({ running: true })
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(onStop).toHaveBeenCalled()
  })

  it('still sends while a reply runs, when there is text', () => {
    box({ running: true })
    type('And another thing')
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
  })

  it('greys the voice button with the reason and does not start voice @SC-994', () => {
    const v = voice({ available: false, reason: 'Your organisation has no speech to text.' })
    box({ voice: v })
    const button = screen.getByRole('button', { name: /Start voice/ })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    fireEvent.mouseEnter(button)
    expect(screen.getByTestId('tooltip').textContent).toBe('Your organisation has no speech to text.')
    fireEvent.click(button)
    expect(v.onStart).not.toHaveBeenCalled()
    expect(screen.getByTestId('attention-text').textContent).toBe('Your organisation has no speech to text.')
    expect(screen.queryByTestId('voice-reason')).toBeNull()
  })

  it('gives a reason when none was sent', () => {
    box({ voice: voice({ available: false }) })
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Start voice/ }))
    expect(screen.getByTestId('tooltip').textContent).toBe('Voice is not available here.')
  })
})

describe('the box in a call @SC-1007', () => {
  const slots = () => Array.from(screen.getByTestId('message-actions').querySelectorAll('button')).map((b) => b.getAttribute('aria-label'))

  it('keeps its two buttons: Mute where dictate was, a round End in the danger colour where Start voice was @SC-994', () => {
    const v = voice({ inVoice: true, speaker: 'listening' })
    box({ voice: v })
    expect(slots()).toEqual(['Mute', 'End the call'])
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }))
    const end = screen.getByRole('button', { name: 'End the call' })
    fireEvent.click(end)
    expect(v.onMute).toHaveBeenCalled()
    expect(v.onEnd).toHaveBeenCalled()
    expect(end.className).toContain('rounded-full')
    expect(end.className).toContain('bg-button-danger')
    expect(end.getAttribute('title')).toBe('End the call')
    // A cross, so it is not mistaken for the square that stops a typed reply.
    expect(end.querySelector('svg.lucide-x')).not.toBeNull()
  })

  it('has nothing outside the box and no "voice is on" mark', () => {
    box({ voice: voice({ inVoice: true, speaker: 'listening' }) })
    expect(screen.queryByTestId('voice-controls')).toBeNull()
    expect(screen.queryByRole('img', { name: 'Voice is on' })).toBeNull()
    expect(screen.getByTestId('message-pill').parentElement!.children.length).toBe(1)
  })

  it('shows muted as the selected fill with the muted icon, and Unmute as its label', () => {
    const v = voice({ inVoice: true, speaker: 'muted', muted: true })
    box({ voice: v })
    const unmute = screen.getByRole('button', { name: 'Unmute' })
    expect(unmute.getAttribute('aria-pressed')).toBe('true')
    expect(unmute.className).toContain('bg-selected')
    expect(unmute.getAttribute('title')).toBe('Unmute')
    fireEvent.click(unmute)
    expect(v.onMute).toHaveBeenCalled()
  })

  it('gives the right slot to Send while the person types, and End returns when the box empties', () => {
    box({ voice: voice({ inVoice: true, speaker: 'listening' }) })
    type('a fix')
    expect(slots()).toEqual(['Mute', 'Send'])
    expect(screen.queryByRole('button', { name: 'End the call' })).toBeNull()
    type('')
    expect(slots()).toEqual(['Mute', 'End the call'])
  })

  it('ends the call, not the reply, when a reply is running', () => {
    box({ running: true, voice: voice({ inVoice: true, speaker: 'agent' }) })
    expect(slots()).toEqual(['Mute', 'End the call'])
  })

  it('puts a raised hand just left of Mute', () => {
    box({ voice: voice({ inVoice: true, speaker: 'listening', handRaised: { agentName: 'Kernel', onInvite: vi.fn() } }) })
    expect(slots()).toEqual(['Kernel has an update. Tap to hear it now.', 'Mute', 'End the call'])
  })

  it('stays usable: a typed message is sent as typed', async () => {
    const { onSend } = box({ voice: voice({ inVoice: true, speaker: 'listening' }) })
    type('Use the other word')
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await vi.waitFor(() => expect(onSend).toHaveBeenCalledWith('Use the other word'))
  })

  it('has no start button and no dictation while voice owns the microphone', () => {
    box({ voice: voice({ inVoice: true, speaker: 'listening' }) })
    expect(screen.queryByRole('button', { name: /Start voice/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Dictate' })).toBeNull()
  })

  it('draws no colour for who is speaking: the line above the box says it', () => {
    box({ voice: voice({ inVoice: true, speaker: 'agent' }) })
    expect(screen.getByTestId('message-pill').className).not.toMatch(/\bring-/)
  })
})

describe('the plus @SC-1007', () => {
  it('is not drawn when nothing gives it items', () => {
    box()
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull()
  })

  it('opens the items it is given, and runs the one chosen', () => {
    const onSelect = vi.fn()
    box({ plusItems: [{ id: 'x', label: 'Photo or file', icon: <span />, onSelect }] })
    expect(screen.queryByText('Photo or file')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Photo or file' }))
    expect(onSelect).toHaveBeenCalled()
    expect(screen.queryByTestId('plus-menu')).toBeNull()
  })
})

describe('the model chip @SC-1007', () => {
  it('stands in row two, after the plus and before dictation and send', () => {
    box({ plusItems: [{ id: 'x', label: 'Photo', icon: <span />, onSelect: vi.fn() }], model: <button type="button" aria-label="Model">DeepSeek Flash</button> })
    const labels = Array.from(screen.getByTestId('message-actions').querySelectorAll('button')).map((b) => b.getAttribute('aria-label'))
    expect(labels).toEqual(['Add', 'Model', 'Dictate', 'Start voice'])
  })
})

describe('how to send @SC-1007', () => {
  it('is said by the send button’s tooltip, and nowhere else on the page', () => {
    box()
    type('Hello')
    expect(screen.getByRole('button', { name: 'Send' }).getAttribute('title')).toBe('Send (Enter) · Shift+Enter for a new line')
    expect(screen.queryByText(/Shift\+Enter/)).toBeNull()
  })
})

describe('the box grows with its text @SC-1007', () => {
  it('grows with what is written up to its limit, then scrolls', () => {
    box()
    const field = fieldOf('Message Kernel…')
    expect(field.style.maxHeight).toBe('128px')
    expect(field.className).toContain('overflow-y-auto')
  })
})

describe('the box is always two rows @SC-1007', () => {
  it('has what is typed in row one and the buttons in row two, however long the text', () => {
    box()
    const pill = screen.getByTestId('message-pill')
    const actions = screen.getByTestId('message-actions')
    for (const text of ['', 'Short', 'First line\nsecond line']) {
      type(text)
      expect(pill.className).toContain('flex-col')
      expect(actions.parentElement).toBe(pill)
      expect(pill.contains(fieldOf('Message Kernel…'))).toBe(true)
      expect(actions.contains(fieldOf('Message Kernel…'))).toBe(false)
    }
  })

  it('keeps the same field, and its focus, as the text grows', () => {
    box()
    const field = fieldOf('Message Kernel…')
    field.focus()
    type('First line\nsecond line')
    expect(screen.getByLabelText('Message Kernel…')).toBe(field)
    expect(document.activeElement).toBe(field)
  })
})

describe('voice gets ready before it is pressed @SC-1007', () => {
  it('asks voice to get ready when the pointer is over its button, or it has focus', () => {
    const onPrepare = vi.fn()
    box({ voice: voice({ onPrepare }) })
    const button = screen.getByRole('button', { name: 'Start voice' })
    fireEvent.pointerEnter(button)
    fireEvent.focus(button)
    expect(onPrepare).toHaveBeenCalledTimes(2)
  })
})

describe('the raised hand and the connection on the voice pill', () => {
  it('shows a raised-hand badge while an agent has an update, and a tap invites it', () => {
    const onInvite = vi.fn()
    box({ voice: voice({ inVoice: true, speaker: 'listening', handRaised: { agentName: 'Kernel', onInvite } }) })
    fireEvent.click(screen.getByRole('button', { name: 'Kernel has an update. Tap to hear it now.' }))
    expect(onInvite).toHaveBeenCalled()
  })

  it('shows no badge when no hand is raised', () => {
    box({ voice: voice({ inVoice: true, speaker: 'listening', handRaised: null }) })
    expect(screen.queryByTestId('voice-hand-raised')).toBeNull()
  })

  it('draws no status line round the box in a call: the ring is the only sign', () => {
    box({ voice: voice({ inVoice: true, speaker: 'listening' }) })
    expect(screen.queryByRole('status')).toBeNull()
  })
})


describe('a box that cannot be written in now @SC-1911 @SC-1007', () => {
  it('is greyed with the reason in its tooltip, and a press opens the dialog with its action', () => {
    const onNew = vi.fn()
    const { onSend } = box({ refusal: { reason: 'This conversation is closed', detail: 'It can no longer continue.', actions: [{ label: 'Start a new conversation', onClick: onNew }] } })
    const pill = screen.getByTestId('message-pill')
    expect(pill.getAttribute('aria-disabled')).toBe('true')
    fireEvent.mouseEnter(pill)
    expect(screen.getByTestId('tooltip').textContent).toBe('This conversation is closed')
    fireEvent.click(pill)
    expect(screen.getByTestId('attention-text').textContent).toBe('It can no longer continue.')
    fireEvent.click(screen.getByRole('button', { name: 'Start a new conversation' }))
    expect(onNew).toHaveBeenCalled()
    expect(onSend).not.toHaveBeenCalled()
  })

  it('opens the dialog from the keyboard too', () => {
    box({ refusal: { reason: 'No access', detail: 'Ask an administrator.' } })
    const pill = screen.getByTestId('message-pill')
    expect(pill.tabIndex).toBe(0)
    fireEvent.keyDown(pill, { key: 'Enter' })
    expect(screen.getByTestId('attention-text').textContent).toBe('Ask an administrator.')
  })
})

describe('a message not sent (handler 10) @SC-1934', () => {
  it('says "Not sent" with why in the box’s own slot, keeps the words, and sends them again on Send again', async () => {
    const onSend = vi.fn(async () => true)
    render(<MessageBox placeholder="Message Kernel…" running={false} sending={false} onSend={onSend} onStop={vi.fn()} voice={voice()} notSent="HQ did not answer." />)
    type('Add a line about the voice sounds')
    const slot = screen.getByTestId('message-box-slot')
    expect(slot.textContent).toContain('Not sent: HQ did not answer.')
    expect(slot.querySelector('[role="status"]')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Send again' }))
    await vi.waitFor(() => expect(onSend).toHaveBeenCalledWith('Add a line about the voice sounds'))
  })

  it('has no slot when nothing failed', () => {
    box()
    expect(screen.queryByTestId('message-box-slot')).toBeNull()
  })
})
