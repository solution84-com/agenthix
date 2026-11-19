// @vitest-environment jsdom
/**
 * The playground's conversation moves as the chat panel's does (useThreadFollow, laid out by hand as the chat's own
 * follow tests do: jsdom lays nothing out): the person's new words are held at the top, with room under them for the reply.
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaygroundEntry } from '../../../../shared/voicePlayground'
import type { VoiceSession, VoiceSnapshot } from '../../voiceSession'
import { PIN_MARGIN } from '../../../components/threadScroll'
import { LivePane } from '../LivePane'

vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u1' } }) }))
vi.mock('wasp/client/operations', () => ({ getModelChoices: {}, getSpeechToken: async () => ({}), useQuery: () => ({ data: { models: [] } }) }))
vi.mock('wasp/client/webSocket', () => ({ useSocket: () => ({ socket: null }) }))

const entry = (id: string, role: 'person' | 'agent', text: string, at: number): PlaygroundEntry =>
  ({ id, role, text, turnId: `t${id}`, state: 'COMPLETED', at }) as PlaygroundEntry
const snapshot = { phase: 'off', muted: false, partial: '' } as unknown as VoiceSnapshot

const rect = (top: number, bottom: number) => ({ top, bottom, height: bottom - top, left: 0, right: 0, width: 0, x: 0, y: top, toJSON() {} }) as DOMRect

function Pane({ entries }: { entries: PlaygroundEntry[] }) {
  return <LivePane session={{} as VoiceSession} snapshot={snapshot} entries={entries} decisions={[]} startVoice={() => {}} sendText={async () => {}} log={() => {}} />
}

let frames: FrameRequestCallback[] = []
beforeEach(() => {
  frames = []
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => frames.push(f))
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('the playground follows its conversation as the chat does', () => {
  it('holds the person\'s new words at the top of the view, the margin above them, when a turn starts', () => {
    const before = [entry('p1', 'person', 'Hello', 1), entry('a1', 'agent', 'Hi there', 2)]
    const { rerender } = render(<Pane entries={before} />)
    const box = screen.getByTestId('playground-scroll')
    const inner = screen.getByTestId('playground-end-space')
    // The conversation is 1200 px of text; whatever room the follow writes under it adds to what can be scrolled.
    const height = () => 1200 + (parseFloat(inner.style.paddingBottom) || 0)
    Object.defineProperty(box, 'scrollHeight', { configurable: true, get: height })
    Object.defineProperty(box, 'clientHeight', { configurable: true, value: 500 })
    box.getBoundingClientRect = () => rect(0, 500)
    inner.getBoundingClientRect = () => rect(-box.scrollTop, height() - box.scrollTop)

    rerender(<Pane entries={[...before, entry('p2', 'person', 'A new question', 3)]} />)
    const words = [...document.querySelectorAll<HTMLElement>('[data-person-words]')].pop()!
    words.getBoundingClientRect = () => rect(1100 - box.scrollTop, 1150 - box.scrollTop)
    for (let n = 0; n < 20 && frames.length; n++) { const due = frames; frames = []; act(() => due.forEach(f => f(n * 16))) }

    expect(box.scrollTop).toBe(1100 - PIN_MARGIN)
  })
})
