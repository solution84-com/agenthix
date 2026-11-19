// @vitest-environment jsdom
/**
 * The playground page (plan task 4c): Live only, Models, Tuning and Lab in the Settings tab, the conversation and the
 * Log drawn from what the server side sends, the Log's badges and filters, the dialogs opened from their buttons, and
 * the page refusing itself outside development. The two tabs and the badge key are in layout.test.tsx.
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ModelChoice, ModelChoices } from '../../../../shared/conversations/protocol'
import { VOICE_PLAYGROUND_SOCKET as P, type PlaygroundDecision, type PlaygroundEntry } from '../../../../shared/voicePlayground'
import { Playground } from '../Playground'
import type { AckSocket } from '../playgroundSession'

vi.mock('../../../../shared/layouts/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('@agenthix/ui/primitives', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agenthix/ui/primitives')>()),
  PlainSelect: (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} />,
}))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u1' } }) }))
vi.mock('wasp/client/operations', () => ({ getModelChoices: {}, getSpeechToken: async () => ({}), useQuery: () => ({ data: { models: [] } }) }))
vi.mock('wasp/client/webSocket', () => ({ useSocket: () => ({ socket: null }) }))

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllEnvs() })

function fakeSocket() {
  const handlers = new Map<string, Set<(p: never) => void>>()
  const asked: { event: string; payload: unknown }[] = []
  const emitted: string[] = []
  const socket: AckSocket = {
    on: (event, h) => { (handlers.get(event) ?? handlers.set(event, new Set()).get(event)!).add(h as never) },
    off: (event, h) => { handlers.get(event)?.delete(h as never) },
    emit: (event) => { emitted.push(event) },
    timeout: () => ({
      emitWithAck: async (event: string, payload: unknown) => {
        asked.push({ event, payload })
        return { ok: true, entryId: 'e' }
      },
    }),
  }
  const fire = (event: string, payload: unknown) => act(() => { handlers.get(event)?.forEach(h => (h as (p: unknown) => void)(payload)) })
  return { socket, fire, asked, emitted }
}

const model = (value: string, label: string, notWorking = false): ModelChoice => ({ value, label, maker: 'X', via: 'via Test', price: 1, ...(notWorking && { notWorking }) }) as ModelChoice
const choicesOf = (models: ModelChoice[]): ModelChoices => ({ models, recent: [], current: models[0]?.value ?? '' }) as unknown as ModelChoices
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve() })

/** Opens on the Settings tab, where Models, Tuning and Lab are; `logTab()` goes to the Log. */
async function page(models: ModelChoice[] = [model('p1/a', 'Flash'), model('p1/b', 'Sonnet')]) {
  const f = fakeSocket()
  render(<Playground socket={f.socket} userId="u1" getToken={async () => ({}) as never} choices={choicesOf(models)} />)
  await flush()
  fireEvent.click(screen.getByTestId('playground-tab-settings'))
  return f
}
const logTab = () => fireEvent.click(screen.getByTestId('playground-tab-log'))

const settingsPanel = () => screen.getByRole('tabpanel', { name: 'Settings' })

describe('the voice playground page @SC-1840', () => {
  it('opens on Live: Talk to with the fake model first, the Adaptive voice switch, and the conversation box', async () => {
    await page()
    const models = screen.getByTestId('models-section')
    expect(within(models).getByLabelText('Talk to').textContent).toContain('Fake model (test waiting)')
    expect(within(models).getByLabelText('Seconds before the fake model answers')).toBeTruthy()
    expect(models.textContent).toMatch(/answers after.*seconds/)
    expect(within(models).getByRole('switch', { name: 'Adaptive voice' }).getAttribute('aria-checked')).toBe('true')
    expect(models.textContent).toContain('On')
    expect(screen.getByLabelText('Message')).toBeTruthy()
    expect(screen.queryByText('Mute')).toBeNull()
    expect(screen.queryByText('Stop speaking')).toBeNull()
    expect(screen.getByTestId('voice-phase').textContent).toBe('')
    expect(document.body.textContent).not.toMatch(/Voice: off/)
    expect(document.body.textContent).not.toMatch(new RegExp('can' + 'ned', 'i'))
    expect(screen.queryByText('Typed')).toBeNull()
    expect(screen.queryByText(/Replay/)).toBeNull()
  })

  it('offers only working models after the fake one, and hides the delay once a model is chosen', async () => {
    await page([model('p1/a', 'Flash'), model('p2/b', 'Broken', true)])
    fireEvent.click(screen.getByLabelText('Talk to'))
    const options = within(screen.getByRole('listbox')).getAllByRole('option').map(o => o.textContent)
    expect(options.some(o => o?.includes('Flash'))).toBe(true)
    expect(options[0]).toContain('Fake model (test waiting)')
    fireEvent.click(screen.getByRole('option', { name: /Flash/ }))
    expect(screen.getByLabelText('Talk to').textContent).toContain('Flash')
    expect(screen.queryByLabelText('Seconds before the fake model answers')).toBeNull()
  })

  it('switches the Adaptive voice off, and explains it in a dialog as the light model listening, or plain voice', async () => {
    await page()
    fireEvent.click(screen.getByRole('switch', { name: 'Adaptive voice' }))
    expect(screen.getByTestId('models-section').textContent).toContain('Off')
    fireEvent.click(screen.getByLabelText('About Adaptive voice'))
    const dialog = screen.getByRole('dialog', { name: 'Adaptive voice' })
    expect(dialog.textContent).toMatch(/small, fast model listens/)
    expect(dialog.textContent).toMatch(/Off:.*plain voice/)
    expect(dialog.textContent).not.toMatch(/one stored phrase/)
    fireEvent.click(within(dialog).getAllByText('Close').at(-1)!)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the light model\'s tuning under Tuning, the older listener\'s sliders no more, and the lab\'s cards under Lab', async () => {
    await page()
    expect(within(settingsPanel()).getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual(['Models', 'Tuning · light model', 'Hear the sounds · backchannel', 'Lab'])
    expect(within(settingsPanel()).queryByLabelText('Shortest gap')).toBeNull()
    expect(screen.getByTestId('listener-tuning')).toBeTruthy()
    expect(screen.getByTestId('lab-cards').children).toHaveLength(6)
  })

  it('names the lab cards in one line', async () => {
    await page()
    expect(within(screen.getByTestId('lab-cards')).getByText('Finished? (audio)')).toBeTruthy()
    expect(within(screen.getByTestId('lab-cards')).getByText(/dropped events/)).toBeTruthy()
  })

  it('opens the full lab as a panel that takes focus, holds Tab and gives focus back on Escape', async () => {
    await page()
    const opener = screen.getByText('Open full lab')
    opener.focus()
    fireEvent.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Voice lab' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('draws the fake model\'s seconds box 44 px wide with its words on one line', async () => {
    await page()
    const box = screen.getByLabelText('Seconds before the fake model answers')
    expect(box.style.width).toBe('2.75rem')
    expect(box.closest('label')!.className).toContain('whitespace-nowrap')
  })

  it('draws each turn in the conversation and its decision in the Log, a hold as one line in its place', async () => {
    const f = await page()
    logTab()
    const person: PlaygroundEntry = { id: 'p1', role: 'person', text: 'Move it to Thursday and', at: 1_000, turnId: 't1', spoken: true }
    const agent: PlaygroundEntry = { id: 'a1', role: 'agent', text: '', at: 1_100, turnId: 't1', state: 'COMPLETED', withdrawn: true }
    const held: PlaygroundDecision = { turnId: 't1', kind: 'held', text: 'ended on "and"', at: 1_900 }
    f.fire(P.entry, person)
    f.fire(P.entry, agent)
    f.fire(P.decision, held)
    const log = screen.getByTestId('playground-log')
    // The turn's card: your words, then the lead's decision on its reply, found under Heavy too.
    const decision = within(log).getByText(/held, kept listening/).closest('li')!
    expect(decision.getAttribute('data-badge')).toBe('HEAVY')
    expect(decision.textContent).toContain('+0.90 s')
    expect(within(log).getByTestId('log-turn').textContent).toContain('You: “Move it to Thursday and”')
    fireEvent.click(within(screen.getByRole('group', { name: 'Show in the log' })).getByText('Heavy'))
    expect(within(log).getByText(/held, kept listening/)).toBeTruthy()
    expect(screen.getByTestId('playground-transcript').textContent).toContain('held · “ended on "and"” · +0.90 s')
    f.fire(P.cleared, {})
    expect(screen.getByText('Nothing said yet.')).toBeTruthy()
  })

  it('shows the server\'s lines and a call that answers no turn as SYSTEM steps of no turn, and narrows them with the filter chips', async () => {
    const f = await page()
    logTab()
    f.fire(P.usage, { model: 'p1/a', inputTokens: 3_410, outputTokens: 22 })
    f.fire(P.log, { level: 'error', text: "Couldn't speak this reply." })
    f.fire(P.log, { level: 'info', text: 'Voice ended.' })
    const tags = () => [...screen.getByTestId('playground-log').querySelectorAll('li[data-badge]')].map(li => `${li.getAttribute('data-badge')} ${li.getAttribute('data-tag')}`)
    expect(tags()).toEqual(['SYSTEM notice', 'SYSTEM error', 'SYSTEM notice'])
    expect(screen.getByTestId('log-loose')).toBeTruthy()
    expect(screen.getByText(/Flash · 3,410 tokens in, 22 out/)).toBeTruthy()
    const chips = screen.getByRole('group', { name: 'Show in the log' })
    fireEvent.click(within(chips).getByText('Errors'))
    expect(tags()).toEqual(['SYSTEM error'])
    fireEvent.click(within(chips).getByText('Light'))
    expect(tags()).toEqual([])
    fireEvent.click(within(chips).getByText('All'))
    expect(tags()).toHaveLength(3)
  })

  it('ignores a stored lead of the old fake kind', async () => {
    localStorage.setItem('voice-playground.settings', JSON.stringify({ lead: { kind: 'can' + 'ned', delayMs: 5 } }))
    await page()
    expect(screen.getByLabelText('Seconds before the fake model answers')).toBeTruthy()
  })

  it('gives the information button a 24 px hit area', async () => {
    await page()
    expect(screen.getByLabelText('About Adaptive voice').className).toContain('size-6')
  })

  it('outside a development build, says it exists only there and draws nothing of it', async () => {
    vi.stubEnv('DEV', false)
    const { VoicePlaygroundPage } = await import('../VoicePlaygroundPage')
    render(<VoicePlaygroundPage />)
    expect(screen.getByText('The voice playground exists only in development builds.')).toBeTruthy()
    expect(screen.queryByText('Talk to')).toBeNull()
  })
})
