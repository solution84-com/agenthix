// @vitest-environment jsdom
/**
 * The playground's small panes: Live's box (Mute and Stop speaking only when they can be used, the state in words),
 * the conversation's marks, the Log's cut, and the words a result is shown in.
 */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { PlaygroundEntry } from '../../../../shared/voicePlayground'
import type { VoiceSession, VoiceSnapshot } from '../../voiceSession'
import { LivePane } from '../LivePane'
import { LogPanel } from '../LogPanel'
import { Transcript } from '../Transcript'
import { didWords } from '../scenarioRun'
import type { LogEntry } from '../playgroundLog'

afterEach(cleanup)

const snap = (p: Partial<VoiceSnapshot>): VoiceSnapshot => ({ phase: 'off', muted: false, partial: '', ...p }) as VoiceSnapshot
const session = { end: vi.fn(), toggleMute: vi.fn(), stopSpeaking: vi.fn() } as unknown as VoiceSession
const pane = (snapshot: VoiceSnapshot) => render(<LivePane session={session} snapshot={snapshot} entries={[]} decisions={[]} startVoice={() => undefined} sendText={async () => undefined} log={() => undefined} />)

describe('Live\'s box', () => {
  it('with voice off shows no Mute, no Stop speaking and an empty state line', () => {
    pane(snap({ phase: 'off' }))
    expect(screen.queryByText('Mute')).toBeNull()
    expect(screen.queryByText('Stop speaking')).toBeNull()
    expect(screen.getByTestId('voice-phase').textContent).toBe('')
  })

  it('with voice on shows Mute and "Listening", never a phase name, and the heard words as the person\'s bubble @SC-1921', () => {
    pane(snap({ phase: 'thinking', partial: 'move it to' }))
    expect(screen.getByText('Mute')).toBeTruthy()
    expect(screen.queryByText('Stop speaking')).toBeNull()
    expect(screen.getByTestId('voice-phase').textContent).toBe('Listening')
    expect(document.querySelector('[data-role="person"][data-live]')!.textContent).toBe('move it toYou')
  })

  it('shows Unmute and "Muted", and Stop speaking only while the agent speaks', () => {
    pane(snap({ phase: 'speaking', muted: true }))
    expect(screen.getByText('Unmute')).toBeTruthy()
    expect(screen.getByText('Stop speaking')).toBeTruthy()
    expect(screen.getByTestId('voice-phase').textContent).toBe('Muted')
  })
})

describe('the conversation\'s marks', () => {
  const entry = (p: Partial<PlaygroundEntry>): PlaygroundEntry => ({ id: 'e', role: 'agent', text: 'Hello', at: 1, turnId: 't', ...p }) as PlaygroundEntry
  it('keeps interrupted, withdrawn and the error, and nothing else', () => {
    render(<Transcript entries={[
      entry({ id: '1', role: 'person', spoken: true, trailedOff: true }),
      entry({ id: '2', state: 'CANCELLED', interrupted: true, withdrawn: true, error: 'It broke', firstTextAt: 5, spoken: true }),
    ]} />)
    const text = screen.getByTestId('playground-transcript').textContent!
    expect(text).toContain('interrupted · withdrawn')
    expect(text).toContain('It broke')
    expect(text).not.toMatch(/spoken|voiced|trailed off|first text|cancelled/)
  })
})

describe('the Log\'s cut', () => {
  const many = (n: number): LogEntry[] => Array.from({ length: n }, (_, i) => ({ id: `l${i}`, at: i, badge: 'CALL', title: `call ${i}` }))
  it('says it shows the newest 300 when it cuts, and only then', () => {
    const { rerender } = render(<LogPanel lists={[many(301)]} />)
    expect(screen.getByText('Showing the newest 300')).toBeTruthy()
    expect(screen.getByTestId('playground-log').children).toHaveLength(300)
    rerender(<LogPanel lists={[many(10)]} />)
    expect(screen.queryByText('Showing the newest 300')).toBeNull()
  })
})

describe('the words a result is shown in', () => {
  it('uses plain words for the two tool outcomes and leaves the rest', () => {
    expect(didWords('held')).toBe('kept listening')
    expect(didWords('called start_work')).toBe('started the work')
    expect(didWords('answered')).toBe('answered')
    expect(didWords('said nothing')).toBe('said nothing')
  })
})
