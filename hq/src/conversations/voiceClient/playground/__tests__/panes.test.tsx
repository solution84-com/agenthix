// @vitest-environment jsdom
/**
 * The playground's small panes: Live's box (Mute and Stop speaking only when they can be used, the state in words),
 * the conversation's marks, and the Log: one card per turn, its cut, its filters and the rules it marks.
 */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { PlaygroundEntry } from '../../../../shared/voicePlayground'
import type { VoiceSession, VoiceSnapshot } from '../../voiceSession'
import { LivePane } from '../LivePane'
import { LogPanel } from '../LogPanel'
import { Transcript } from '../Transcript'
import type { CardStep, LogCard } from '../logModel'

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

const T0 = 1_700_000_000_000
const cardStep = (rel: number, p: Partial<CardStep> & Pick<CardStep, 'actor' | 'tag'>): CardStep => ({ id: `${p.actor}${rel}`, at: T0 + rel, rel, title: p.tag, ...p })
const card = (i: number, steps: CardStep[] = [cardStep(0, { actor: 'YOU', tag: 'said', title: `“turn ${i}”` })]): LogCard =>
  ({ id: `turn-${i}`, zero: T0 + i, steps, message: `turn ${i}`, outcome: 'Handed to the heavy model', timings: ['you stopped at 1.0 s'] })

describe('the Log as turns', () => {
  it('says it shows the newest 100 turns when it cuts, and only then', () => {
    const many = (n: number) => ({ cards: Array.from({ length: n }, (_, i) => card(i)), loose: [] })
    const { rerender } = render(<LogPanel view={many(101)} />)
    expect(screen.getByText('Showing the newest 100 turns')).toBeTruthy()
    expect(screen.getAllByTestId('log-turn')).toHaveLength(100)
    rerender(<LogPanel view={many(10)} />)
    expect(screen.queryByText('Showing the newest 100 turns')).toBeNull()
  })

  it('draws each step with its time from the turn\'s start, the clock time on hover, its actor, its tag and the data a test reads', () => {
    const light = cardStep(3_400, { actor: 'LIGHT', tag: 'hand_over', title: 'Asked because SOUND said finished', check: true, ends: 'handedOver', ruleBroken: 3, attrs: { seq: '4', moment: 'soundsFinished' } })
    render(<LogPanel view={{ cards: [card(1, [cardStep(0, { actor: 'YOU', tag: 'said' }), light])], loose: [] }} />)
    const turn = screen.getByTestId('log-turn')
    expect(within(turn).getByTestId('log-turn-outcome').textContent).toBe('Handed to the heavy model · you stopped at 1.0 s')
    const row = within(turn).getAllByTestId('log-row')[1]!
    expect([row.getAttribute('data-badge'), row.getAttribute('data-tag'), row.getAttribute('data-seq'), row.getAttribute('data-rule-broken')]).toEqual(['LIGHT', 'hand_over', '4', '3'])
    const time = row.querySelector('time')!
    expect(time.textContent).toBe('3.4 s')
    expect(time.getAttribute('title')).toMatch(/^\d\d:\d\d:\d\d\.\d{3}$/)
    expect(row.textContent).toContain('should not happen')
    expect(within(row).getByText('LIGHT').getAttribute('title')).toMatch(/light model/)
    expect(within(row).getByText('hand_over').getAttribute('title')).toMatch(/heavy model answers/)
  })

  it('shows a LIGHT step\'s reason under its line as "why: …", and marks a card that ran with the reason on', () => {
    const light = cardStep(3_400, { actor: 'LIGHT', tag: 'hand_over', title: 'Asked because SOUND said finished', check: true, why: 'A finished question.', reasonOn: true, detail: 'heard “Hi”' })
    render(<LogPanel view={{ cards: [{ ...card(1, [cardStep(0, { actor: 'YOU', tag: 'said' }), light]), reasonOn: true }, card(2)], loose: [] }} />)
    const [on, off] = screen.getAllByTestId('log-turn')
    expect(within(on!).getByTestId('log-why').textContent).toBe('why: A finished question.')
    expect(within(on!).getByTestId('log-reason-on').getAttribute('title')).toMatch(/not production/)
    expect(within(on!).getByTestId('log-reason-on').textContent).toBe('reason on')
    expect(within(off!).queryByTestId('log-reason-on')).toBeNull()
    expect(within(off!).queryByTestId('log-why')).toBeNull()
  })

  it('filters by actor, hiding steps and a card only when none of its steps is left; Errors shows what failed and what should not happen @SC-2227', () => {
    const view = {
      cards: [
        card(2, [cardStep(0, { actor: 'YOU', tag: 'said' }), cardStep(1_000, { actor: 'SYSTEM', tag: 'error', error: true })]),
        card(1, [cardStep(0, { actor: 'YOU', tag: 'said' }), cardStep(500, { actor: 'LIGHT', tag: 'acknowledge', ruleBroken: 2 }), cardStep(700, { actor: 'BACKCHANNEL', tag: 'hum' })]),
      ],
      loose: [cardStep(0, { actor: 'SYSTEM', tag: 'notice', title: 'Voice started.' })],
    }
    render(<LogPanel view={view} />)
    expect(screen.getByTestId('log-loose').textContent).toContain('Voice started.')
    const chips = screen.getByRole('group', { name: 'Show in the log' })
    expect(within(chips).getAllByRole('button').map(b => b.textContent)).toEqual(['All', 'You', 'Sound', 'Light', 'Heavy', 'System', 'Backchannel', 'Pace', 'Voice and tone', 'Errors'])
    const shown = () => screen.queryAllByTestId('log-turn').map(t => within(t).getAllByTestId('log-row').map(r => r.getAttribute('data-tag')))
    fireEvent.click(within(chips).getByText('Light'))
    expect(shown()).toEqual([['acknowledge']])
    expect(screen.queryByTestId('log-loose')).toBeNull()
    fireEvent.click(within(chips).getByText('Backchannel'))
    expect(shown()).toEqual([['hum']])
    fireEvent.click(within(chips).getByText('Errors'))
    expect(shown()).toEqual([['error'], ['acknowledge']])
    fireEvent.click(within(chips).getByText('You'))
    expect(shown()).toEqual([['said'], ['said']])
  })

  it('folds the backchannel\'s near misses under a count on the card, shown on a press @SC-2227', () => {
    const miss = (rel: number, title: string) => cardStep(rel, { actor: 'BACKCHANNEL', tag: 'no hum', title, nearMiss: true })
    render(<LogPanel view={{ cards: [card(1, [cardStep(0, { actor: 'YOU', tag: 'said' }), miss(900, 'after a question'), miss(2_000, 'the pause ended at 0.3 s')])], loose: [] }} />)
    const tags = () => screen.getAllByTestId('log-row').map(r => r.getAttribute('data-tag'))
    expect(tags()).toEqual(['said'])
    const fold = screen.getByTestId('log-near-misses')
    expect([fold.textContent, fold.getAttribute('aria-expanded')]).toEqual(['2 near misses', 'false'])
    fireEvent.click(fold)
    expect(tags()).toEqual(['said', 'no hum', 'no hum'])
    expect(fold.getAttribute('aria-expanded')).toBe('true')
  })

  it('folds the hum service\'s answers into one line on the card, shown on a press @SC-2228', () => {
    const answer = (rel: number, kind: string, ms: number) =>
      cardStep(rel, { actor: 'BACKCHANNEL', tag: 'service', title: kind, service: { kind, tone: 'calm', ms, skipped: 0, dropped: false } })
    render(<LogPanel view={{ cards: [card(1, [cardStep(0, { actor: 'YOU', tag: 'said' }), answer(1_000, 'continuer', 400), answer(2_000, 'news', 600)])], loose: [] }} />)
    const tags = () => screen.getAllByTestId('log-row').map(r => r.getAttribute('data-tag'))
    expect(tags()).toEqual(['said'])
    const line = screen.getByTestId('log-hum-service')
    expect(line.textContent).toBe('2 hum service answers: continuer calm ×1, news calm ×1 · median 0.50 s · slowest 0.60 s · none skipped')
    fireEvent.click(line)
    expect(tags()).toEqual(['said', 'service', 'service'])
  })
})
