// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SpeechInputOptions } from '../../voiceClient/speechInput'

const getSpeechToken = vi.fn(async (_args?: { agentId?: string; hears?: string[] }) => ({ provider: 'assemblyai', token: 't', expiresAt: new Date(Date.now() + 600_000).toISOString(), config: {} }))
vi.mock('wasp/client/operations', () => ({ getSpeechToken: (args?: { agentId?: string; hears?: string[] }) => getSpeechToken(args) }))

const speech = { opts: null as SpeechInputOptions | null, start: vi.fn(async () => undefined), stop: vi.fn(), setMuted: vi.fn(), endTurn: vi.fn() }
vi.mock('../../voiceClient/speechInput', () => ({
  createSpeechInput: (opts: SpeechInputOptions) => { speech.opts = opts; return speech },
}))

import { MessageBox } from '../MessageBox'
import { fieldOf, typeInto, valueOf } from './messageFieldHelpers'

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers() })

const LABEL = 'Message Kernel…'

function box(agentId?: string) {
  const onSend = vi.fn(async () => true)
  render(<MessageBox agentId={agentId} placeholder="Message Kernel…" running={false} sending={false} onSend={onSend} onStop={vi.fn()} />)
  return { onSend, field: { get value() { return valueOf(LABEL) } } }
}

async function dictate() {
  fireEvent.click(screen.getByRole('button', { name: 'Dictate' }))
  await vi.waitFor(() => expect(speech.start).toHaveBeenCalled())
}

const partial = (text: string, order: number) => act(() => { speech.opts!.onPartial(text, order) })
const turn = (text: string, order: number) => act(() => { speech.opts!.onTurn(text, order) })

describe('dictating into the box @SC-1003 @SC-1836 @SC-1934', () => {
  it('asks for the conversation’s agent’s own speech to text', async () => {
    box('a1')
    await dictate()
    await vi.waitFor(() => expect(speech.opts).not.toBeNull())
    await speech.opts!.getToken()
    expect(getSpeechToken).toHaveBeenCalledWith({ agentId: 'a1', conversationId: undefined, hears: ['inworld', 'assemblyai'] })
  })

  it('asks for the default when the box has no agent, naming both services it can stream to', async () => {
    box()
    await dictate()
    await speech.opts!.getToken()
    expect(getSpeechToken).toHaveBeenCalledWith({ agentId: undefined, conversationId: undefined, hears: ['inworld', 'assemblyai'] })
  })

  it('hands the input whichever service hq minted the token for, so one voice key covers dictation', async () => {
    getSpeechToken.mockResolvedValueOnce({ provider: 'inworld', token: 'iw', expiresAt: new Date(Date.now() + 600_000).toISOString(), config: {} })
    box()
    await dictate()
    expect(await speech.opts!.getToken()).toMatchObject({ provider: 'inworld', token: 'iw' })
  })

  it('shows hq’s words when no listening provider works, naming no single vendor', async () => {
    getSpeechToken.mockRejectedValueOnce(new Error("Voice isn't set up: no speech to text provider has been added. An organisation admin can add one."))
    speech.start.mockImplementationOnce(async () => { await speech.opts!.getToken() })
    box()
    fireEvent.click(screen.getByRole('button', { name: 'Dictate' }))
    expect((await screen.findByRole('alert')).textContent).toContain("isn't set up")
  })

  it('shows the words as they are heard, as text in the box, and keeps each turn', async () => {
    const { field } = box()
    await dictate()
    await partial('So it started', 0)
    expect(field.value).toBe('So it started')
    await turn('So it started capturing.', 0)
    await partial('This is a', 1)
    expect(field.value).toBe('So it started capturing. This is a')
    await partial('This is a test.', 1)
    expect(field.value).toBe('So it started capturing. This is a test.')
  })

  it('sends the finished words when Send is pressed mid-sentence', async () => {
    const { onSend } = box()
    await dictate()
    await partial('I want to see how', 0)
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await vi.waitFor(() => expect(speech.endTurn).toHaveBeenCalled())
    expect(onSend).not.toHaveBeenCalled()
    await turn('I want to see how well this works.', 0)
    await vi.waitFor(() => expect(onSend).toHaveBeenCalledWith('I want to see how well this works.'))
    expect(speech.stop).toHaveBeenCalled()
  })

  it('sends what is shown when the service is slow to finish', async () => {
    const { onSend } = box()
    await dictate()
    await partial('I want to see how', 0)
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    vi.useRealTimers()
    await vi.waitFor(() => expect(onSend).toHaveBeenCalledWith('I want to see how'))
  })

  it('keeps the words heard so far when dictation is stopped', async () => {
    const { field, onSend } = box()
    await dictate()
    await partial('Keep this', 0)
    fireEvent.click(screen.getByRole('button', { name: 'Stop dictating' }))
    await vi.waitFor(() => expect(speech.endTurn).toHaveBeenCalled())
    await turn('Keep this.', 0)
    await vi.waitFor(() => expect(speech.stop).toHaveBeenCalled())
    expect(field.value).toBe('Keep this.')
    expect(onSend).not.toHaveBeenCalled()
  })

  it('keeps the person’s typing while words are heard', async () => {
    const { field } = box()
    typeInto(LABEL, 'Note:')
    await dictate()
    await partial('one', 0)
    typeInto(LABEL, 'Quick note: one')
    await partial('one two', 0)
    expect(field.value).toBe('Quick note: one two')
  })

  it('clears the box on Send, and the next message is the person’s own: dictated words are sent once', async () => {
    const { field, onSend } = box()
    await dictate()
    await turn('This is a test.', 0)
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await vi.waitFor(() => expect(onSend).toHaveBeenCalledWith('This is a test.'))
    await vi.waitFor(() => expect(field.value).toBe(''))
    expect(speech.stop).toHaveBeenCalled()
    typeInto(LABEL, 'Typed after')
    expect(field.value).toBe('Typed after')
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await vi.waitFor(() => expect(onSend).toHaveBeenLastCalledWith('Typed after'))
    expect(onSend).toHaveBeenCalledTimes(2)
  })

  it('starts a new dictation after a send clean, and stops it on the next Send', async () => {
    const { field, onSend } = box()
    await dictate()
    await turn('First message.', 0)
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await vi.waitFor(() => expect(field.value).toBe(''))
    await dictate()
    await partial('Second', 0)
    expect(field.value).toBe('Second')
    await turn('Second message.', 0)
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await vi.waitFor(() => expect(onSend).toHaveBeenLastCalledWith('Second message.'))
    await vi.waitFor(() => expect(field.value).toBe(''))
    expect(speech.stop).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: 'Dictate' })).toBeTruthy()
  })

  it('never writes back over the box once it was changed outside dictation: later words go after it', async () => {
    const { field } = box()
    await dictate()
    await turn('Old words.', 0)
    // Typing replaces everything, then the service corrects the old turn: the box stays the person's.
    typeInto(LABEL, 'Mine')
    await turn('Old words, corrected.', 0)
    expect(field.value).toBe('Mine')
    await partial('new', 1)
    expect(field.value).toBe('Mine new')
  })

  it('writes beside a chip in the box, keeping the chip and the same field @SC-1543', async () => {
    const { field } = box()
    typeInto(LABEL, 'See files/q3.pdf ')
    const element = fieldOf(LABEL)
    await dictate()
    await partial('now please', 0)
    expect(field.value).toBe('See files/q3.pdf now please')
    expect(fieldOf(LABEL)).toBe(element)
    expect(element.querySelector('[data-reference="files/q3.pdf"]')).not.toBeNull()
  })

  it('fetches a token when the box is focused, so the microphone connects at once', async () => {
    box()
    fireEvent.focus(fieldOf(LABEL))
    await vi.waitFor(() => expect(getSpeechToken).toHaveBeenCalledTimes(1))
    await dictate()
    await speech.opts!.getToken()
    expect(getSpeechToken).toHaveBeenCalledTimes(1)
  })
})

describe('dictation failing (A-023)', () => {
  it('says why it stopped part-way under the box, not as a dialog, and clears it on the next dictation', async () => {
    box()
    await dictate()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Stop dictating' })).toBeTruthy())
    act(() => { speech.opts!.onFail('The speech service hung up.') })
    expect(screen.getByTestId('message-box-slot').textContent).toContain('Dictation stopped: The speech service hung up.')
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Dictate' }))
    await vi.waitFor(() => expect(screen.queryByTestId('message-box-slot')).toBeNull())
  })

  it('opens the dialog when dictation could not start: the press failed', async () => {
    speech.start.mockRejectedValueOnce(new Error('The microphone could not be used.'))
    box()
    fireEvent.click(screen.getByRole('button', { name: 'Dictate' }))
    expect((await screen.findByRole('alert')).textContent).toContain('The microphone could not be used.')
    expect(screen.getByRole('dialog').textContent).toContain('Dictation could not start')
  })
})
