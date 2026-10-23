// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Voice } from '../../../../voice/ttsAdapter'

const state = vi.hoisted(() => ({ data: undefined as unknown, error: undefined as Error | undefined, args: undefined as unknown }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (_q: unknown, args: unknown) => { state.args = args; return { data: state.data, error: state.error } },
  listInworldVoices: {}, previewVoice: vi.fn(),
}))

import { VoiceDialog, VoicePlayButton } from '../VoiceDialog'
import { setBackendForTests } from '../voicePlayer'

const voice = (over: Partial<Voice>): Voice => ({
  voiceId: 'x', displayName: 'X', description: '', languageCode: 'en-US', accent: 'American', gender: 'male', ageGroup: 'middle_aged',
  categories: [], tags: [], source: 'SYSTEM', isCustom: false, ...over,
})
const voices = [
  voice({ voiceId: 'Felix', displayName: 'Felix', description: 'Calm, friendly British male voice', languageCode: 'en-GB', accent: 'British', tags: ['calm'] }),
  voice({ voiceId: 'Clive', displayName: 'Clive', description: 'British-accented male voice, calm and cordial', languageCode: 'en-GB', accent: 'British' }),
  voice({ voiceId: 'Diego', displayName: 'Diego', description: 'Warm Mexican voice', languageCode: 'es-MX', accent: 'Mexican' }),
  voice({ voiceId: 'ws__zed', displayName: 'Zed', description: 'Our founder', source: 'IVC', isCustom: true }),
]

const fetchAudio = vi.fn(async () => 'audio')
let ended: (() => void) | null = null
const stops: string[] = []
const started: string[] = []

beforeEach(() => {
  state.data = voices; state.error = undefined
  fetchAudio.mockClear(); stops.length = 0; started.length = 0; ended = null
  setBackendForTests({
    fetchAudio,
    start: (audio, done) => { started.push(audio); ended = done; return () => { stops.push(audio) } },
  })
})
afterEach(() => { cleanup(); setBackendForTests(null) })

const rows = () => within(screen.getByRole('listbox', { name: 'Voices' })).getAllByRole('option')
const names = () => rows().map(r => r.querySelector('span.font-medium, span[class*="font-medium"]')?.textContent ?? '')

describe('the voice dialog @SC-1204', () => {
  it('shows the model as text, lists the provider’s voices and starts on English with custom voices first', () => {
    render(<VoiceDialog providerId="p-iw" current={null} onClose={() => {}} onChoose={() => {}} />)
    expect(state.args).toEqual({ providerId: 'p-iw' })
    expect(screen.getByText('Inworld TTS 2')).toBeTruthy()
    expect((screen.getByLabelText('Language') as HTMLSelectElement).value).toBe('en')
    expect(rows()).toHaveLength(3)
    expect(rows()[0].textContent).toContain('Custom')
    expect(screen.getByRole('status').textContent).toBe('3 English voices')
  })

  it('narrows by the filters, searches inside them, and clears them', () => {
    render(<VoiceDialog providerId="p-iw" current={null} onClose={() => {}} onChoose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Accent'), { target: { value: 'British' } })
    expect(screen.getByRole('status').textContent).toBe('2 English voices with a British accent')
    fireEvent.change(screen.getByLabelText('Search voices'), { target: { value: 'friendly' } })
    expect(screen.getByRole('status').textContent).toBe('1 of 2 English voices with a British accent match “friendly”')
    expect(rows()).toHaveLength(1)
    fireEvent.click(screen.getByText('Clear filters'))
    expect(rows()).toHaveLength(4)
    expect(screen.queryByText('Clear filters')).toBeNull()
  })

  it('searches the tags in their own dropdown', () => {
    render(<VoiceDialog providerId="p-iw" current={null} onClose={() => {}} onChoose={() => {}} />)
    fireEvent.click(screen.getByLabelText('Tag'))
    fireEvent.change(screen.getByLabelText('Search tags'), { target: { value: 'cal' } })
    fireEvent.click(within(screen.getByRole('listbox', { name: 'Tags' })).getByText('calm'))
    expect(rows().map(r => r.textContent)).toEqual([expect.stringContaining('Felix')])
  })

  it('chooses a voice by tapping it, plays its sample in the language filter’s language, and lights then dims its mark', async () => {
    const onChoose = vi.fn()
    render(<VoiceDialog providerId="p-iw" current={null} onClose={() => {}} onChoose={onChoose} />)
    expect((screen.getByText('Use') as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByText('Felix'))
    expect(rows().find(r => r.textContent?.includes('Felix'))?.getAttribute('aria-selected')).toBe('true')
    await waitFor(() => expect(started).toEqual(['audio']))
    expect(fetchAudio).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'p-iw', voiceId: 'Felix', lang: 'en' }))
    expect(rows().find(r => r.textContent?.includes('Felix'))?.textContent).toContain('▮▮')

    ended!()
    await waitFor(() => expect(rows().find(r => r.textContent?.includes('Felix'))?.textContent).toContain('▶'))

    fireEvent.click(screen.getByText('Use Felix'))
    expect(onChoose).toHaveBeenCalledWith('Felix')
  })

  it('replays on another tap and stops the first when another voice is tapped', async () => {
    render(<VoiceDialog providerId="p-iw" current={null} onClose={() => {}} onChoose={() => {}} />)
    fireEvent.click(screen.getByText('Felix'))
    await waitFor(() => expect(started).toHaveLength(1))
    fireEvent.click(screen.getByText('Felix'))
    await waitFor(() => expect(started).toHaveLength(2))
    expect(stops).toHaveLength(1)
    fireEvent.click(screen.getByText('Clive'))
    await waitFor(() => expect(started).toHaveLength(3))
    expect(stops).toHaveLength(2)
    const lit = rows().filter(r => r.textContent?.includes('▮▮')).map(r => r.textContent)
    expect(lit).toHaveLength(1)
    expect(lit[0]).toContain('Clive')
  })

  it('starts with the current voice chosen, and Cancel closes without choosing', () => {
    const onClose = vi.fn(); const onChoose = vi.fn()
    render(<VoiceDialog providerId="p-iw" current="Clive" onClose={onClose} onChoose={onChoose} />)
    expect(screen.getByText('Use Clive')).toBeTruthy()
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalled()
    expect(onChoose).not.toHaveBeenCalled()
  })

  it('stops playing when it closes', async () => {
    const view = render(<VoiceDialog providerId="p-iw" current={null} onClose={() => {}} onChoose={() => {}} />)
    fireEvent.click(screen.getByText('Felix'))
    await waitFor(() => expect(started).toHaveLength(1))
    view.unmount()
    expect(stops).toHaveLength(1)
  })

  it('says what went wrong when the voices cannot be listed', () => {
    state.data = undefined; state.error = new Error("Voice is down: text to speech isn't working. An organisation admin has been told.")
    render(<VoiceDialog providerId="p-iw" current={null} onClose={() => {}} onChoose={() => {}} />)
    expect(screen.getByRole('alert').textContent).toContain('Voice is down')
  })
})

describe('a voice’s play button @SC-1204', () => {
  it('plays its sample and is lit while it plays', async () => {
    render(<VoicePlayButton providerId="p-iw" voiceId="Alistair" />)
    const button = screen.getByRole('button', { name: 'Play Alistair' })
    fireEvent.click(button)
    await waitFor(() => expect(started).toHaveLength(1))
    expect(screen.getByRole('button', { name: 'Stop Alistair' }).getAttribute('aria-pressed')).toBe('true')
    ended!()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Play Alistair' }).getAttribute('aria-pressed')).toBe('false'))
  })
})
