// @vitest-environment jsdom
/**
 * The playground's layout (the lane after its walkthrough): the conversation on the left; on the right two tabs, Log
 * first and open, Settings with Models, Tuning and Lab stacked; the last tab remembered for this browser; a model pick
 * the page no longer offers never kept; and the key to the Log's badges.
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ModelChoice, ModelChoices } from '../../../../shared/conversations/protocol'
import { VOICE_PLAYGROUND_SOCKET as P, type PlaygroundEntry } from '../../../../shared/voicePlayground'
import { LIGHT_SOCKET as L, type PlaygroundLightConfig } from '../../../../shared/voicePlaygroundLight'
import { Playground } from '../Playground'
import type { AckSocket } from '../playgroundSession'
import { ACTOR_HELP, ACTOR_TAGS, LIGHT_ACTIONS, tagHelp } from '../badgeHelp'
import { LOG_ACTORS, LOG_FILTERS } from '../logModel'
import { staleLead, staleListener } from '../staleModels'

vi.mock('../../../../shared/layouts/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u1' } }) }))
vi.mock('wasp/client/operations', () => ({ getModelChoices: {}, getSpeechToken: async () => ({}), useQuery: () => ({ data: { models: [] } }) }))
vi.mock('wasp/client/webSocket', () => ({ useSocket: () => ({ socket: null }) }))

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup() })

function fakeSocket() {
  const handlers = new Map<string, Set<(p: never) => void>>()
  const emitted: { event: string; payload: unknown }[] = []
  const sent: unknown[] = []
  const socket: AckSocket = {
    on: (event, h) => { (handlers.get(event) ?? handlers.set(event, new Set()).get(event)!).add(h as never) },
    off: (event, h) => { handlers.get(event)?.delete(h as never) },
    emit: (event, payload?: unknown) => { emitted.push({ event, payload }) },
    timeout: () => ({ emitWithAck: async (event: string, payload: unknown) => { if (event === P.send) sent.push(payload); return { ok: true, entryId: 'e' } } }),
  }
  const fire = (event: string, payload: unknown) => act(() => { handlers.get(event)?.forEach(h => (h as (p: unknown) => void)(payload)) })
  const configs = () => emitted.filter(e => e.event === L.config).map(e => e.payload as PlaygroundLightConfig)
  return { socket, fire, configs, sent, emitted }
}

const FLASH = 'or/~deepseek/deepseek-flash-latest'
const model = (value: string, label: string): ModelChoice => ({ value, label, maker: 'X', via: 'via Test', price: 1 }) as ModelChoice
const CHOICES = { models: [model(FLASH, 'DeepSeek Flash'), model('p1/big', 'Big')], recent: [], current: '' } as unknown as ModelChoices
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve() })

async function page(choices: ModelChoices = CHOICES) {
  const f = fakeSocket()
  render(<Playground socket={f.socket} userId="u1" getToken={async () => ({}) as never} choices={choices} />)
  await flush()
  return f
}

const keep = (v: object) => localStorage.setItem('voice-playground.settings', JSON.stringify(v))
const openSettings = () => fireEvent.click(screen.getByTestId('playground-tab-settings'))

describe('the pick the page no longer offers', () => {
  it('Talk to falls back to the fake model, and the light model to DeepSeek Flash when it is offered, else hq\'s own choice', () => {
    expect(staleLead({ kind: 'model', model: 'p9/gone' }, CHOICES)).toEqual({ kind: 'fake', delayMs: 1_500 })
    expect(staleLead({ kind: 'model', model: 'p1/big' }, CHOICES)).toBeNull()
    expect(staleLead({ kind: 'model', model: 'p9/gone' }, undefined)).toBeNull()
    expect(staleLead({ kind: 'fake', delayMs: 3_000 }, CHOICES)).toBeNull()
    expect(staleListener('p9/gone', CHOICES)).toEqual({ model: null, label: 'DeepSeek Flash' })
    expect(staleListener('p9/gone', { models: [model('p1/big', 'Big')], recent: [], current: '' } as unknown as ModelChoices)).toEqual({ model: 'hq-listener-choice', label: "hq's choice for listening" })
    expect(staleListener('p1/big', CHOICES)).toBeNull()
    expect(staleListener(null, CHOICES)).toBeNull()
    expect(staleListener('hq-listener-choice', CHOICES)).toBeNull()
  })

  it('a model that is not working is not offered either', () => {
    const broken = { models: [{ ...model('p1/big', 'Big'), notWorking: true }], recent: [], current: '' } as unknown as ModelChoices
    expect(staleLead({ kind: 'model', model: 'p1/big' }, broken)).toEqual({ kind: 'fake', delayMs: 1_500 })
  })

  it('is replaced on the page, never kept, said in one line under each picker, and never sent', async () => {
    keep({ lead: { kind: 'model', model: 'p9/gone' }, listenerModel: 'p9/gone-too' })
    const f = await page()
    openSettings()
    expect(screen.getByTestId('lead-stale-note').textContent).toBe("Your last pick isn't offered here any more, so this is Fake model.")
    expect(screen.getByTestId('light-stale-note').textContent).toBe("Your last pick isn't offered here any more, so this is DeepSeek Flash.")
    expect(screen.getByLabelText('Talk to').textContent).toContain('Fake model')
    expect(screen.getByTestId('light-model-picker').textContent).toContain('DeepSeek Flash')
    expect(JSON.stringify(localStorage.getItem('voice-playground.settings'))).not.toContain('p9/')
    expect(f.configs().map(c => c.model)).not.toContain('p9/gone-too')
    expect(f.configs().at(-1)!.model).toBe(FLASH)
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'hello' } })
    fireEvent.submit(screen.getByTestId('message-send').closest('form')!)
    await flush()
    expect(f.sent.at(-1)).toMatchObject({ lead: { kind: 'fake' } })
  })

  it('says nothing when the pick is still offered, and the note goes when a pick is made', async () => {
    keep({ lead: { kind: 'model', model: 'p1/big' } })
    await page()
    openSettings()
    expect(screen.queryByTestId('lead-stale-note')).toBeNull()
    expect(screen.queryByTestId('light-stale-note')).toBeNull()
  })

  it('waits for the choices before judging a pick', async () => {
    keep({ lead: { kind: 'model', model: 'p9/gone' } })
    const f = fakeSocket()
    const { rerender } = render(<Playground socket={f.socket} userId="u1" getToken={async () => ({}) as never} choices={undefined} />)
    await flush()
    expect(JSON.parse(localStorage.getItem('voice-playground.settings') ?? '{}').lead).toEqual({ kind: 'model', model: 'p9/gone' })
    expect(screen.queryByTestId('lead-stale-note')).toBeNull()
    rerender(<Playground socket={f.socket} userId="u1" getToken={async () => ({}) as never} choices={CHOICES} />)
    await flush()
    openSettings()
    expect(screen.getByTestId('lead-stale-note')).toBeTruthy()
  })
})

describe('the two tabs', () => {
  it('opens on the Log, with Settings beside it and nothing else', async () => {
    await page()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map(t => t.textContent)).toEqual(['Log', 'Settings'])
    expect(screen.getByTestId('playground-tab-log').getAttribute('aria-selected')).toBe('true')
    expect(screen.getByTestId('playground-log')).toBeTruthy()
    expect(screen.getByRole('tabpanel', { name: 'Log' })).toBeTruthy()
  })

  it('remembers the last tab for this browser, and opens on the Log when it cannot', async () => {
    await page()
    openSettings()
    expect(localStorage.getItem('voice-playground.tab')).toBe('settings')
    cleanup()
    await page()
    expect(screen.getByTestId('playground-tab-settings').getAttribute('aria-selected')).toBe('true')
    cleanup()
    localStorage.setItem('voice-playground.tab', 'nonsense')
    await page()
    expect(screen.getByTestId('playground-tab-log').getAttribute('aria-selected')).toBe('true')
  })

  it('works when the browser keeps nothing', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    await page()
    openSettings()
    expect(screen.getByTestId('playground-tab-settings').getAttribute('aria-selected')).toBe('true')
    get.mockRestore(); set.mockRestore()
  })

  it('moves between tabs with the arrow keys', async () => {
    await page()
    fireEvent.keyDown(screen.getByTestId('playground-tab-log'), { key: 'ArrowRight' })
    expect(screen.getByTestId('playground-tab-settings').getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(screen.getByTestId('playground-tab-settings'), { key: 'ArrowLeft' })
    expect(screen.getByTestId('playground-tab-log').getAttribute('aria-selected')).toBe('true')
  })
})

describe('the Settings tab', () => {
  it('stacks Models, Tuning and Lab with a heading each, in that order, and folds nothing', async () => {
    await page()
    openSettings()
    const panel = screen.getByRole('tabpanel', { name: 'Settings' })
    expect(within(panel).getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual(['Models', 'Tuning · light model', 'Hear the sounds · backchannel', 'Lab'])
    expect(within(panel).queryByRole('button', { name: /^(Tuning|Lab)/ })).toBeNull()
    expect(within(panel).getByTestId('lab-cards').children).toHaveLength(6)
  })

  it('names the two pickers by what they do, with one switch, Adaptive voice, and the light model\'s picker under it', async () => {
    await page()
    openSettings()
    const models = screen.getByTestId('models-section')
    expect(models.textContent).toContain('Talk to · answers you')
    expect(models.textContent).toContain('Light model · listens while you speak')
    expect(within(models).getByLabelText('Talk to').textContent).toContain('Fake model (test waiting)')
    expect(within(models).getAllByRole('switch').map(s => s.getAttribute('aria-label') ?? s.textContent)).toHaveLength(1)
    expect(within(models).queryByRole('switch', { name: 'Light model' })).toBeNull()
    expect(within(models).getByRole('switch', { name: 'Adaptive voice' })).toBeTruthy()
    const order = [...models.querySelectorAll('[role="switch"], [data-testid="light-model-picker"]')]
    expect(order.map(e => e.getAttribute('data-testid') ?? 'switch')).toEqual(['switch', 'light-model-picker'])
    expect(within(models).getByLabelText('About Adaptive voice')).toBeTruthy()
    expect(models.textContent).not.toMatch(/summary/i)
  })

  it('hides the light model\'s picker while Adaptive voice is off, and reads an older kept "light model off" as Adaptive voice alone', async () => {
    keep({ lightModel: false })
    const f = await page()
    openSettings()
    expect(screen.getByTestId('light-model-picker')).toBeTruthy()
    expect(f.configs().at(-1)).toMatchObject({ on: true, adaptiveVoice: true })
    fireEvent.click(screen.getByRole('switch', { name: 'Adaptive voice' }))
    expect(screen.getByTestId('models-section').querySelector('[data-testid="light-model-picker"]')).toBeNull()
    expect(f.configs().at(-1)).toMatchObject({ on: true, adaptiveVoice: false })
    expect(screen.queryByLabelText('Shortest gap')).toBeNull()
  })
})

describe('the conversation and its header', () => {
  it('has the title and Start over, and no mode switch, Compare row or Set', async () => {
    const f = await page()
    const header = screen.getByRole('banner', { name: 'Voice playground' })
    expect(within(header).getByRole('heading', { level: 1 }).textContent).toBe('Voice playground')
    expect(screen.queryByText('Scenarios')).toBeNull()
    expect(screen.queryByText('Compare')).toBeNull()
    expect(screen.queryByText('Clear results')).toBeNull()
    expect(screen.queryByTestId('scenarios-row')).toBeNull()
    expect(screen.queryByTestId('live-row')).toBeNull()
    expect(screen.getByLabelText('Message')).toBeTruthy()
    fireEvent.click(within(header).getByText('Start over'))
    expect(f.emitted.map(e => e.event)).toContain(P.reset)
  })
})

const entry = (e: Partial<PlaygroundEntry>): PlaygroundEntry => ({ id: 'e1', role: 'person', text: 'Hello there', spoken: true, at: 1_700_000_000_000, ...e }) as PlaygroundEntry

describe('the key to the badges', () => {
  it('sits at the end of the tab bar while the Log is open, and opens the flow of a turn, LIGHT\'s five actions, the fallback, plain voice and each actor with its tags', async () => {
    await page()
    const bar = screen.getByRole('tablist')
    expect(bar.lastElementChild?.textContent).toContain('Badges')
    expect(screen.getByTestId('log-filters').textContent).not.toContain('Badges')
    expect(screen.queryByTestId('badge-key-list')).toBeNull()
    fireEvent.click(screen.getByTestId('badge-key'))
    const list = screen.getByTestId('badge-key-list')
    for (const name of ['Who does what in a turn', "LIGHT's five actions", 'The fallback', 'Adaptive voice off', 'Each actor and its tags']) {
      expect(within(list).getByRole('region', { name })).toBeTruthy()
    }
    expect(within(within(list).getByRole('region', { name: "LIGHT's five actions" })).getAllByRole('row')).toHaveLength(LIGHT_ACTIONS.length + 1)
    for (const { actor, tags } of ACTOR_TAGS) {
      const li = list.querySelector(`[data-actor="${actor}"]`)!
      expect(li.textContent).toContain(ACTOR_HELP[actor])
      for (const t of tags) expect(li.textContent).toContain(tagHelp(actor, t))
    }
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('badge-key-list')).toBeNull()
    fireEvent.click(screen.getByTestId('playground-tab-settings'))
    expect(screen.queryByTestId('badge-key')).toBeNull()
  })

  it('names each actor once, with a line for it and every tag it can carry', () => {
    expect(ACTOR_TAGS.map(a => a.actor)).toEqual(LOG_ACTORS)
    for (const { actor, tags } of ACTOR_TAGS) {
      expect(ACTOR_HELP[actor].trim().length).toBeGreaterThan(10)
      for (const t of tags) expect(tagHelp(actor, t).trim().length).toBeGreaterThan(10)
    }
    expect(ACTOR_TAGS.find(a => a.actor === 'LIGHT')!.tags).toEqual(expect.arrayContaining(LIGHT_ACTIONS.map(a => a.action)))
  })

  it('gives each badge and tag in a row its line as a hover title', async () => {
    const f = await page()
    await f.fire(P.entry, entry({ spoken: false }))
    const row = screen.getAllByTestId('log-row')[0]!
    expect(within(row).getByText('YOU').getAttribute('title')).toBe(ACTOR_HELP.YOU)
    expect(within(row).getByText('said').getAttribute('title')).toBe(tagHelp('YOU', 'said'))
  })

  it('filters by the actors, and Errors', () => {
    expect(LOG_FILTERS.map(f => f.label)).toEqual(['All', 'You', 'Sound', 'Light', 'Heavy', 'System', 'Backchannel', 'Pace', 'Voice and tone', 'Errors'])
  })
})
