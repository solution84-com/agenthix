// @vitest-environment jsdom
/**
 * The playground page (plan task 4c): the two modes and their rows, the side column the same in both, the
 * conversation and the Log drawn from what the server side sends, the Log's badges and filters, the dialogs opened
 * from their buttons, the result groups collapsing and expanding, and the page refusing itself outside development.
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ModelChoice, ModelChoices } from '../../../../shared/conversations/protocol'
import {
  VOICE_PLAYGROUND_SOCKET as P,
  type PlaygroundDecision, type PlaygroundEntry, type ScenarioLibrary, type ScenarioResult,
} from '../../../../shared/voicePlayground'
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

const LIBRARY: ScenarioLibrary = {
  inputTokensPerRun: 300_000,
  groups: [
    { id: 'hold', title: 'Person trails off: the agent should stay quiet', scenarios: [
      { id: 'd01', wanted: 'hold', last: 'Can you move the review to, um, hmm', conversation: [['agent', 'Hi.']] },
      { id: 'd02', wanted: 'hold', last: 'Move it to Thursday and', conversation: [['agent', 'Hi.']] },
    ] },
    { id: 'reply', title: 'Person has finished: the agent should answer', scenarios: [{ id: 'e01', wanted: 'reply', last: "What's the status of the deploy?", conversation: [['agent', 'Hi.']] }] },
    { id: 'quick', title: 'Quick questions: answer at once', scenarios: [{ id: 'fq01', wanted: 'quick', last: "What's the capital of France?", conversation: [['agent', 'Hi.']] }] },
    { id: 'task', title: 'Tasks: say it will do it, then start', scenarios: [{ id: 'ft01', wanted: 'task', last: 'Book the meeting.', conversation: [['agent', 'Hi.']] }] },
  ],
}

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
        if (event === P.scenarios) return { ok: true, library: LIBRARY }
        if (event === P.scenarioRun) return { ok: true, runId: 'r1', calls: 10 }
        if (event === P.scenarioSent) return { ok: true, sent: { instructions: ['You are Kernel.'], messages: [{ role: 'user', content: 'Hi' }], tools: [{ name: 'keep_listening', description: 'x', input: {} }], settings: { model: 'a' } } }
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

async function page(models: ModelChoice[] = [model('p1/a', 'Flash'), model('p1/b', 'Sonnet')]) {
  const f = fakeSocket()
  render(<Playground socket={f.socket} userId="u1" getToken={async () => ({}) as never} choices={choicesOf(models)} />)
  await flush()
  return f
}

const sideColumn = () => screen.getByRole('complementary', { name: 'Tuning, lab and log' })
const sideHeadings = () => within(sideColumn()).getAllByRole('heading', { level: 2 }).map(h => h.textContent)
const result = (scenarioId: string, model: string, p: Partial<ScenarioResult>): ScenarioResult => ({
  runId: 'r1', scenarioId, model, pass: true, did: 'held', wroteFirst: false, text: '', reason: null, calls: [], firstOutputMs: 1_100, inputTokens: 3_410, outputTokens: 22, ...p,
})

describe('the voice playground page @SC-1840', () => {
  it('opens on Live: Talk to with the fake model first, the Adaptive voice switch, Start over, and the conversation box', async () => {
    const f = await page()
    const row = screen.getByTestId('live-row')
    expect(within(row).getByLabelText('Talk to').textContent).toContain('Fake model (test waiting)')
    expect(within(row).getByLabelText('Seconds before the fake model answers')).toBeTruthy()
    expect(row.textContent).toMatch(/answers after.*seconds/)
    expect(within(row).getByRole('switch', { name: 'Adaptive voice' }).getAttribute('aria-checked')).toBe('true')
    expect(row.textContent).toContain('On')
    fireEvent.click(within(row).getByText('Start over'))
    expect(f.emitted).toContain(P.reset)
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

  it('switches the Adaptive voice off, and explains it in a dialog', async () => {
    await page()
    fireEvent.click(screen.getByRole('switch', { name: 'Adaptive voice' }))
    expect(screen.getByTestId('live-row').textContent).toContain('Off')
    fireEvent.click(screen.getByLabelText('About Adaptive voice'))
    const dialog = screen.getByRole('dialog', { name: 'Adaptive voice' })
    expect(dialog.textContent).toMatch(/open a slow reply with one short sentence/)
    expect(dialog.textContent).toMatch(/keeps listening when you trail off/)
    fireEvent.click(within(dialog).getAllByText('Close').at(-1)!)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows Tuning, Lab and Log in Live; in Scenarios four sliders and a muted note, no Lab, and no Sounds chip', async () => {
    await page()
    expect(sideHeadings()).toEqual(['Tuning', 'Lab', 'Log'])
    expect(within(sideColumn()).getAllByRole('slider')).toHaveLength(8)
    expect(screen.getByTestId('lab-cards').children).toHaveLength(6)
    expect(within(screen.getByRole('group', { name: 'Show in the log' })).getByText('Sounds')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Scenarios' }))
    expect(sideHeadings()).toEqual(['Tuning', 'Log'])
    expect(within(sideColumn()).getAllByRole('slider').map(s => s.getAttribute('aria-label'))).toEqual([
      'Speech before the first sound', 'Shortest gap', 'Longest gap', 'Longest wait, then a hum',
    ])
    expect(within(sideColumn()).getByText('The other four only matter in Live.')).toBeTruthy()
    expect(screen.queryByTestId('lab-cards')).toBeNull()
    expect(within(screen.getByRole('group', { name: 'Show in the log' })).queryByText('Sounds')).toBeNull()
  })

  it('folds Tuning and Lab away to leave the room to the Log, and remembers it', async () => {
    await page()
    expect(within(sideColumn()).getAllByRole('slider')).toHaveLength(8)
    expect(within(sideColumn()).getByTestId('lab-cards')).toBeTruthy()
    fireEvent.click(within(sideColumn()).getByRole('button', { name: /Tuning/ }))
    fireEvent.click(within(sideColumn()).getByRole('button', { name: /Lab/ }))
    expect(within(sideColumn()).queryAllByRole('slider')).toHaveLength(0)
    expect(within(sideColumn()).queryByTestId('lab-cards')).toBeNull()
    expect(within(sideColumn()).getByTestId('playground-log')).toBeTruthy()
    cleanup()
    await page()
    expect(within(sideColumn()).queryAllByRole('slider')).toHaveLength(0)
    fireEvent.click(within(sideColumn()).getByRole('button', { name: /Tuning/ }))
    expect(within(sideColumn()).getAllByRole('slider')).toHaveLength(8)
  })

  it('names the lab cards in one line and the invitation slider without "held"', async () => {
    await page()
    expect(within(screen.getByTestId('lab-cards')).getByText('Finished? (audio)')).toBeTruthy()
    expect(within(screen.getByTestId('lab-cards')).getByText(/dropped events/)).toBeTruthy()
    expect(within(sideColumn()).getByLabelText('After a hold, invite in')).toBeTruthy()
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

  it('tunes the listening sounds with sliders, in seconds, kept for the next visit, with Reset', async () => {
    await page()
    const gap = screen.getByLabelText('Shortest gap') as HTMLInputElement
    expect(gap.value).toBe('10')
    fireEvent.change(gap, { target: { value: '6.5' } })
    expect(gap.value).toBe('6.5')
    expect(JSON.parse(localStorage.getItem('voice-playground.settings')!).listening.minGapMs).toBe(6_500)
    fireEvent.click(within(sideColumn()).getByText('Reset'))
    expect(gap.value).toBe('10')
  })

  it('draws each turn in the conversation and its decision in the Log, a hold as one line in its place', async () => {
    const f = await page()
    const person: PlaygroundEntry = { id: 'p1', role: 'person', text: 'Move it to Thursday and', at: 1_000, turnId: 't1', spoken: true }
    const agent: PlaygroundEntry = { id: 'a1', role: 'agent', text: '', at: 1_100, turnId: 't1', state: 'COMPLETED', withdrawn: true }
    const held: PlaygroundDecision = { turnId: 't1', kind: 'held', text: 'ended on "and"', at: 1_900 }
    f.fire(P.entry, person)
    f.fire(P.entry, agent)
    f.fire(P.decision, held)
    const log = screen.getByTestId('playground-log')
    // One line for the turn: the agent's answer, its decision and its call folded together, found under Decisions too.
    const decision = within(log).getByText(/Held, kept listening/).closest('li')!
    expect(decision.getAttribute('data-badge')).toBe('AGENT')
    expect(decision.textContent).toContain('+0.90 s')
    fireEvent.click(within(screen.getByRole('group', { name: 'Show in the log' })).getByText('Decisions'))
    expect(within(log).getByText(/Held, kept listening/)).toBeTruthy()
    expect(screen.getByTestId('playground-transcript').textContent).toContain('held · “ended on "and"” · +0.90 s')
    f.fire(P.cleared, {})
    expect(screen.getByText('Nothing said yet.')).toBeTruthy()
  })

  it('badges every Log entry and narrows the Log with its filter chips', async () => {
    const f = await page()
    f.fire(P.usage, { model: 'p1/a', inputTokens: 3_410, outputTokens: 22 })
    f.fire(P.log, { level: 'error', text: "Couldn't speak this reply." })
    f.fire(P.log, { level: 'info', text: 'Voice ended.' })
    const badges = () => [...screen.getByTestId('playground-log').querySelectorAll('li[data-badge]')].map(li => li.getAttribute('data-badge'))
    expect(new Set(badges())).toEqual(new Set(['CALL', 'ERROR', 'NOTICE']))
    expect(screen.getByText('Flash · 3,410 in · 22 out')).toBeTruthy()
    const chips = screen.getByRole('group', { name: 'Show in the log' })
    expect(within(chips).getAllByRole('button').map(b => b.textContent)).toEqual(['All', 'Conversation', 'Decisions', 'Sounds', 'Calls', 'Errors'])
    fireEvent.click(within(chips).getByText('Errors'))
    expect(badges()).toEqual(['ERROR'])
    fireEvent.click(within(chips).getByText('Calls'))
    expect(badges()).toEqual(['CALL'])
    fireEvent.click(within(chips).getByText('Sounds'))
    expect(badges()).toEqual([])
    fireEvent.click(within(chips).getByText('All'))
    expect(badges()).toHaveLength(3)
  })

  it('in Scenarios: Compare, the switch and Clear results; the four fixed groups, each listing its scenarios read-only', async () => {
    await page()
    fireEvent.click(screen.getByRole('radio', { name: 'Scenarios' }))
    const row = screen.getByTestId('scenarios-row')
    expect(row.textContent).toContain('Compare')
    expect(within(row).getByRole('switch', { name: 'Adaptive voice' })).toBeTruthy()
    expect(within(row).getByText('Clear results')).toBeTruthy()
    expect(screen.queryByTestId('live-row')).toBeNull()
    expect(screen.getByText('What will run: always these four, the same every time')).toBeTruthy()
    expect(screen.getAllByText('See them')).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: 'See them: Person trails off: the agent should stay quiet' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByTestId('group-scenarios').textContent).toContain('2 · “Move it to Thursday and”')
    expect(within(dialog).getByTestId('group-scenarios').querySelector('li')!.className).toContain('line-clamp-2')
    expect(within(dialog).getByTestId('group-scenarios').className).toContain('mb-3')
    expect(within(dialog).queryByRole('textbox')).toBeNull()
    expect(within(dialog).getAllByRole('button').map(b => b.textContent)).toEqual(['', 'Close'])
  })

  it('runs every scenario on the models chosen, scores each group, collapses and expands it, and opens a line', async () => {
    const f = await page()
    fireEvent.click(screen.getByRole('radio', { name: 'Scenarios' }))
    expect((screen.getByText('Run all') as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByTestId('run-summary').textContent).toContain('5 scenarios × 2 models = 10 calls')
    expect((screen.getByText('Clear results') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByText('Run all'))
    await flush()
    expect((screen.getByText('Clear results') as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByLabelText('Stop comparing Flash') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText('Add a model to compare') as HTMLButtonElement).disabled).toBe(true)
    expect(f.asked.find(a => a.event === P.scenarioRun)?.payload).toEqual({ models: ['p1/a', 'p1/b'], adaptiveVoice: true })
    f.fire(P.scenarioResult, result('d01', 'p1/a', { pass: false, did: 'answered', text: 'Take your time.' }))
    f.fire(P.scenarioResult, result('d01', 'p1/b', { reason: 'Ended on um, mid-thought' }))
    f.fire(P.scenarioDone, { runId: 'r1', cancelled: false })
    const header = screen.getByRole('button', { name: /^Person trails off/ })
    expect(header.textContent).toContain('0 of 2')
    expect(header.textContent).toContain('1 of 2')
    expect(header.textContent).toContain('1 failed')
    // The first group with a failure opens when the run completes.
    expect(header.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: /^Person has finished/ }).getAttribute('aria-expanded')).toBe('false')
    const lines = screen.getAllByTestId('result-line')
    expect(lines).toHaveLength(2)
    expect(lines[0]!.getAttribute('data-fails')).toBe('true')
    expect(lines[0]!.textContent).toContain('✗ answered')
    expect(lines[0]!.textContent).toContain('✓ kept listening')
    expect(within(screen.getByTestId('playground-log')).getByText(/Sonnet · “Can you move the review to, um, hmm” → kept listening/)).toBeTruthy()
    expect(within(screen.getByTestId('playground-log')).getByText(/^2 calls/)).toBeTruthy()

    fireEvent.click(lines[0]!)
    const detail = screen.getByTestId('line-detail')
    expect(detail.textContent).toContain('✗ fail')
    expect(detail.textContent).toContain('“Take your time.”')
    expect(detail.textContent).toContain('“Ended on um, mid-thought”')
    expect(detail.textContent).toContain('+1.1 s · 3,410 in · 22 out')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('dialog', { name: '“Move it to Thursday and”' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    fireEvent.click(screen.getByText('Show exactly what was sent'))
    await flush()
    expect(f.asked.find(a => a.event === P.scenarioSent)?.payload).toEqual({ runId: 'r1', scenarioId: 'd01', model: 'p1/a' })
    expect(screen.getByRole('dialog', { name: 'Exactly what was sent' }).textContent).toContain('You are Kernel.')
    expect(screen.getByRole('dialog', { name: 'Exactly what was sent' }).textContent).toContain('As hq hands it to the model, without the key.')
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Exactly what was sent' })).getAllByText('Close').at(-1)!)

    fireEvent.click(screen.getByRole('button', { name: /^Person trails off/ }))
    expect(screen.queryAllByTestId('result-line')).toHaveLength(0)
    fireEvent.click(screen.getByText('Clear results'))
    expect(f.emitted).toContain(P.scenarioClear)
    expect(screen.queryByRole('region', { name: 'Result' })).toBeNull()
  })

  it('opens Scenarios with the first two working models chosen, and keeps the person\'s choice even when it is none', async () => {
    await page([model('p1/a', 'Flash'), model('p2/b', 'Broken', true), model('p1/b', 'Sonnet'), model('p1/c', 'Haiku')])
    fireEvent.click(screen.getByRole('radio', { name: 'Scenarios' }))
    expect(screen.getByLabelText('Stop comparing Flash')).toBeTruthy()
    expect(screen.getByLabelText('Stop comparing Sonnet')).toBeTruthy()
    expect(screen.queryByLabelText('Stop comparing Haiku')).toBeNull()
    expect(screen.getByLabelText('Add a model to compare').textContent).toBe('Add a model')
    fireEvent.click(screen.getByLabelText('Stop comparing Flash'))
    fireEvent.click(screen.getByLabelText('Stop comparing Sonnet'))
    expect(screen.queryByLabelText(/Stop comparing/)).toBeNull()
    expect(screen.getByTestId('run-summary').textContent).toBe('Add a model to compare')
    expect((screen.getByText('Run all') as HTMLButtonElement).disabled).toBe(true)
    expect(JSON.parse(localStorage.getItem('voice-playground.settings')!).compareChosen).toBe(true)
  })

  it('says "Up to 6 models" and goes inactive when six are chosen', async () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(k => model(`p1/${k}`, `M${k}`))
    localStorage.setItem('voice-playground.settings', JSON.stringify({ mode: 'scenarios', compare: six.slice(0, 6).map(m => m.value), compareChosen: true }))
    await page(six)
    const add = screen.getByLabelText('Add a model to compare') as HTMLButtonElement
    expect(add.disabled).toBe(true)
    expect(add.title).toBe('Up to 6 models')
    expect(screen.getByText('Up to 6 models', { selector: 'span' })).toBeTruthy()
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
