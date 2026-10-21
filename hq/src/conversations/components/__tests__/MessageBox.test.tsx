// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('wasp/client/operations', () => ({ getSpeechToken: vi.fn() }))

import { MessageBox, type MessageBoxVoice } from '../MessageBox'

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
const type = (text: string) => fireEvent.change(screen.getByLabelText('Message Kernel…'), { target: { value: text } })

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
    await vi.waitFor(() => expect((screen.getByLabelText('Message Kernel…') as HTMLTextAreaElement).value).toBe(''))
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
    expect(button.getAttribute('title')).toBe('Your organisation has no speech to text.')
    fireEvent.click(button)
    expect(v.onStart).not.toHaveBeenCalled()
    expect(screen.getByTestId('voice-reason').textContent).toBe('Your organisation has no speech to text.')
  })

  it('gives a reason when none was sent', () => {
    box({ voice: voice({ available: false }) })
    expect(screen.getByRole('button', { name: /Start voice/ }).getAttribute('title')).toBe('Voice is not available here.')
  })
})

describe('the box in voice mode @SC-1007', () => {
  it('shows mute and End beside the pill, and hides them while the person types @SC-994', () => {
    const v = voice({ inVoice: true, speaker: 'listening' })
    box({ voice: v })
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }))
    fireEvent.click(screen.getByRole('button', { name: 'End' }))
    expect(v.onMute).toHaveBeenCalled()
    expect(v.onEnd).toHaveBeenCalled()
    type('a fix')
    expect(screen.queryByTestId('voice-controls')).toBeNull()
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

  it('rings the pill in the speaker’s colour by token', () => {
    box({ voice: voice({ inVoice: true, speaker: 'agent' }) })
    expect(screen.getByTestId('message-pill').className).toContain('ring-success')
  })
})

describe('the plus @SC-1007', () => {
  it('holds what it is given, the model choice, behind a button', () => {
    box({ plus: <span>model chooser</span> })
    expect(screen.queryByText('model chooser')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(screen.getByText('model chooser')).toBeTruthy()
  })
})

describe('the box grows with its text @SC-1007', () => {
  it('sets its height to fit what is written, up to its limit, and back down when cleared', async () => {
    const tall = vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockReturnValue(96)
    const { onSend } = box()
    const field = screen.getByLabelText('Message Kernel…') as HTMLTextAreaElement
    type('A long message\nover\nseveral lines')
    expect(field.style.height).toBe('96px')
    tall.mockReturnValue(400)
    type('Far too long for the box\n'.repeat(20))
    expect(field.style.height).toBe('128px')
    tall.mockReturnValue(36)
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await vi.waitFor(() => expect(onSend).toHaveBeenCalled())
    await vi.waitFor(() => expect(field.style.height).toBe('36px'))
    tall.mockRestore()
  })
})

describe('from two lines the text takes the whole width above the buttons @SC-1007', () => {
  it('moves the text above the buttons at two lines, and back at one', () => {
    box()
    const pill = screen.getByTestId('message-pill')
    type('Short')
    expect(pill.dataset.twoLines).toBeUndefined()
    type('First line\nsecond line')
    expect(pill.dataset.twoLines).toBe('true')
    type('Back to one line')
    expect(pill.dataset.twoLines).toBeUndefined()
  })

  it('counts a wrapped line at the one-row width', () => {
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)
    const height = vi.spyOn(HTMLDivElement.prototype, 'scrollHeight', 'get').mockReturnValue(42)
    box()
    type('a sentence long enough to wrap onto a second line in the box')
    expect(screen.getByTestId('message-pill').dataset.twoLines).toBe('true')
    width.mockRestore(); height.mockRestore()
  })

  it('keeps the same field, and its focus, when the layout changes', () => {
    box()
    const field = screen.getByLabelText('Message Kernel…') as HTMLTextAreaElement
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

  it('says "Reconnecting…" while the speech connection is replaced', () => {
    box({ voice: voice({ inVoice: true, speaker: 'listening', status: 'Reconnecting…' }) })
    expect(screen.getByTestId('voice-status').textContent).toBe('Reconnecting…')
  })
})
