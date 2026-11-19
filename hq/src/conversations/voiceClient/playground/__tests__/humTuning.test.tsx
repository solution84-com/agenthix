// @vitest-environment jsdom
/**
 * The hum service in Settings › Tuning › Backchannel (spec §The backchannel): its switch, how often it is asked, and its
 * own model picker, apart from the light model's; and "Hear the sounds" showing the sounds kept in this conversation,
 * and a tone's changed steering kept for this page.
 */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { CONVERSATION_VOICE_PAGE_SOCKET as VP } from '@agenthix/core'
import { CONVERSATION_VOICE_SOCKET as V } from '../../../../shared/conversations/voice'
import { playgroundEvent } from '../../../../shared/voicePlayground'
import { BackchannelTuning } from '../BackchannelTuning'
import { HumSounds } from '../HumSounds'
import { createPlaygroundSettings } from '../settings'

afterEach(cleanup)

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) } } }

describe('the hum service\'s settings @SC-2228', () => {
  it('has a switch, an interval of 1 s, and a model picker of its own', () => {
    const settings = createPlaygroundSettings(memory())
    render(<BackchannelTuning settings={settings} />)
    const tuning = screen.getByTestId('hum-service-tuning')
    expect(within(tuning).getByTestId('backchannel-setting-serviceOn').getAttribute('data-on')).toBe('true')
    const interval = within(tuning).getByTestId('backchannel-setting-serviceIntervalMs') as HTMLInputElement
    expect(interval.value).toBe('1')
    fireEvent.change(interval, { target: { value: '1.5' } })
    expect(settings.backchannel().serviceIntervalMs).toBe(1_500)
    expect(within(tuning).getByTestId('hum-model-picker')).toBeTruthy()
  })
})

describe('a reaction hum\'s settings @SC-2228', () => {
  it('has a slider for its spacing, at 3 s, for two in a row, at 8 s, and for its hold, at 4 s; a plain hum\'s at 6 s', () => {
    const settings = createPlaygroundSettings(memory())
    render(<BackchannelTuning settings={settings} />)
    const spacing = screen.getByTestId('backchannel-setting-reactionSpeechMs') as HTMLInputElement
    expect(spacing.value).toBe('3')
    expect((screen.getByTestId('backchannel-setting-reactionGapSpeechMs') as HTMLInputElement).value).toBe('8')
    expect((screen.getByTestId('backchannel-setting-speechMs') as HTMLInputElement).value).toBe('6')
    expect((screen.getByTestId('backchannel-setting-reactionHoldMs') as HTMLInputElement).value).toBe('4')
    fireEvent.change(spacing, { target: { value: '1.5' } })
    expect(settings.backchannel().reactionSpeechMs).toBe(1_500)
  })
})

describe('"Hear the sounds" @SC-2228', () => {
  it('shows the sounds sent in this voice session as they come, made new or already made, forgets them when voice ends, and keeps a changed steering for this page', () => {
    const settings = createPlaygroundSettings(memory())
    const socket = { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
    render(<HumSounds socket={socket} settings={settings} />)
    expect(screen.getByRole('status').textContent).toMatch(/No sounds yet/)
    const handler = (event: string) => socket.on.mock.calls.find(c => c[0] === playgroundEvent(event))![1] as (e: unknown) => void
    React.act(() => handler(VP.backchannelSound)({ conversationId: 'pg', words: 'Oh no.', tone: 'gentle', kind: 'sympathy', audio: new Uint8Array([1, 0]), made: 'new' }))
    React.act(() => handler(VP.backchannelSound)({ conversationId: 'pg', words: '(laughs)', tone: 'bright', kind: 'amusement', failed: true }))
    const kept = screen.getByTestId('hum-kept')
    expect(within(kept).getByText('Oh no.')).toBeTruthy()
    expect(kept.textContent).toMatch(/Oh no\..*made new/)
    expect(kept.textContent).toMatch(/\(laughs\).*not made/)
    React.act(() => handler(V.ended)({ conversationId: 'pg', reason: 'x' }))
    expect(screen.getByTestId('hum-kept').textContent).toBe('')
    const gentle = screen.getByTestId('hum-tone-gentle')
    fireEvent.change(within(gentle).getByRole('textbox'), { target: { value: '[quiet, sad]' } })
    fireEvent.click(within(gentle).getByText('Apply'))
    expect(settings.get().humSteering).toEqual({ gentle: '[quiet, sad]' })
    // Nothing is asked of the server: the sounds are the keeper's.
    expect(socket.emit).not.toHaveBeenCalled()
  })
})
