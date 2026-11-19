// @vitest-environment jsdom
/**
 * The playground page with the light model (plan tasks 5.1–5.3): Adaptive voice is its one switch, its picker under it
 * in the Settings tab's Models, its settings sent to the server and tuned under Tuning with stable test ids, each check
 * in the Log readable from the page.
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ModelChoice, ModelChoices } from '../../../../shared/conversations/protocol'
import { LIGHT_SOCKET as L, type LightCallRow, type PlaygroundLightConfig } from '../../../../shared/voicePlaygroundLight'
import { Playground } from '../Playground'
import type { AckSocket } from '../playgroundSession'

vi.mock('../../../../shared/layouts/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u1' } }) }))
vi.mock('wasp/client/operations', () => ({ getModelChoices: {}, getSpeechToken: async () => ({}), useQuery: () => ({ data: { models: [] } }) }))
vi.mock('wasp/client/webSocket', () => ({ useSocket: () => ({ socket: null }) }))

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup() })

function fakeSocket() {
  const handlers = new Map<string, Set<(p: never) => void>>()
  const emitted: { event: string; payload: unknown }[] = []
  const asked: { event: string; payload: unknown }[] = []
  const socket: AckSocket = {
    on: (event, h) => { (handlers.get(event) ?? handlers.set(event, new Set()).get(event)!).add(h as never) },
    off: (event, h) => { handlers.get(event)?.delete(h as never) },
    emit: (event, payload?: unknown) => { emitted.push({ event, payload }) },
    timeout: () => ({
      emitWithAck: async (event: string, payload: unknown) => {
        asked.push({ event, payload })
        return { ok: true }
      },
    }),
  }
  const fire = (event: string, payload: unknown) => act(() => { handlers.get(event)?.forEach(h => (h as (p: unknown) => void)(payload)) })
  const configs = () => emitted.filter(e => e.event === L.config).map(e => e.payload as PlaygroundLightConfig)
  return { socket, fire, emitted, asked, configs }
}

const model = (value: string, label: string): ModelChoice => ({ value, label, maker: 'X', via: 'via Test', price: 1 }) as ModelChoice
const CHOICES = { models: [model('or/~deepseek/deepseek-flash-latest', 'DeepSeek Flash'), model('p1/big', 'Big')], recent: [], current: '' } as unknown as ModelChoices
const openSettings = () => fireEvent.click(screen.getByTestId('playground-tab-settings'))
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve() })

async function page() {
  const f = fakeSocket()
  render(<Playground socket={f.socket} userId="u1" getToken={async () => ({}) as never} choices={CHOICES} />)
  await flush()
  return f
}

describe('the voice playground with the light model @SC-1840 @SC-2224', () => {
  it('opens with Adaptive voice on, DeepSeek Flash as its light model, and sends its settings to the server', async () => {
    const f = await page()
    openSettings()
    expect(screen.queryByTestId('light-model-switch')).toBeNull()
    expect(screen.getByRole('switch', { name: 'Adaptive voice' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByTestId('light-model-picker').getAttribute('data-value')).toBe('or/~deepseek/deepseek-flash-latest')
    expect(f.configs().at(-1)).toMatchObject({ on: true, model: 'or/~deepseek/deepseek-flash-latest', adaptiveVoice: true, lead: { kind: 'fake' } })
  })

  it('tunes every cap and first value, sent at once and kept, with Reset', async () => {
    const f = await page()
    openSettings()
    expect(screen.getByTestId('listener-tuning')).toBeTruthy()
    const hold = screen.getByTestId('listener-setting-caps-hold') as HTMLInputElement
    expect(hold.value).toBe('12')
    fireEvent.change(hold, { target: { value: '8' } })
    expect(f.configs().at(-1)!.settings).toMatchObject({ caps: { hold: 8 } })
    const limit = screen.getByTestId('listener-setting-soundsFinishedTimeoutMs') as HTMLInputElement
    expect(limit.value).toBe('2')
    fireEvent.change(limit, { target: { value: '1.5' } })
    expect(JSON.parse(localStorage.getItem('voice-playground.settings')!).listener.soundsFinishedTimeoutMs).toBe(1_500)
    fireEvent.click(screen.getByTestId('tuning-reset'))
    expect(hold.value).toBe('12')
    expect(f.configs().at(-1)!.settings).toMatchObject({ caps: { hold: 12 }, soundsFinishedTimeoutMs: 2000 })
  })

  it('speaks the light model\'s lines plainly by default, and in the stored phrases\' direction to compare, kept', async () => {
    const f = await page()
    openSettings()
    expect(f.configs().at(-1)!.lineDirection).toBe('plain')
    const direction = screen.getByTestId('listener-setting-lineDirection')
    expect(direction.getAttribute('data-on')).toBe('false')
    fireEvent.click(within(direction).getByRole('switch'))
    expect(f.configs().at(-1)!.lineDirection).toBe('stored')
    expect(JSON.parse(localStorage.getItem('voice-playground.settings')!).lineDirection).toBe('stored')
  })

  it('has "Light model gives its reason" off, sent when switched on, and turned off by Reset', async () => {
    const f = await page()
    openSettings()
    expect(f.configs().at(-1)!.settings).toMatchObject({ withReason: false })
    const toggle = screen.getByTestId('listener-setting-withReason')
    expect(toggle.getAttribute('data-on')).toBe('false')
    expect(within(toggle).getByRole('switch', { name: 'Light model gives its reason' })).toBeTruthy()
    fireEvent.click(within(toggle).getByRole('switch'))
    expect(f.configs().at(-1)!.settings).toMatchObject({ withReason: true })
    expect(screen.getByTestId('listener-setting-withReason').getAttribute('data-on')).toBe('true')
    fireEvent.click(screen.getByTestId('tuning-reset'))
    expect(f.configs().at(-1)!.settings).toMatchObject({ withReason: false })
    expect(screen.getByTestId('listener-setting-withReason').getAttribute('data-on')).toBe('false')
  })

  it('with Adaptive voice off, sends plain voice and hides the light model\'s picker; the older listener is not offered', async () => {
    const f = await page()
    openSettings()
    fireEvent.click(screen.getByRole('switch', { name: 'Adaptive voice' }))
    expect(f.configs().at(-1)).toMatchObject({ on: true, adaptiveVoice: false })
    expect(screen.queryByTestId('light-model-picker')).toBeNull()
    expect(screen.queryByLabelText('Shortest gap')).toBeNull()
  })

  it('shows each check in the Log, readable from the page, under the Light chip', async () => {
    const f = await page()
    const row: LightCallRow = {
      id: 'c1', seq: 3, moment: 'soundsFinished', keptOpen: false, quietMs: 600, workingMs: null, message: 'Great, thanks.',
      choice: 'close_turn', words: 'Any time.', answer: null, why: null, withReason: false, asked: null, nextCheck: 2, dropped: null, ms: 640,
      stale: false, overLimit: false, superseded: false, failed: false, inputTokens: 1, outputTokens: 1, at: Date.now(),
    }
    f.fire(L.call, row)
    f.fire(L.turn, { id: 't1', seq: 3, outcome: 'closed', say: 'Any time.', at: Date.now() })
    fireEvent.click(within(screen.getByRole('group', { name: 'Show in the log' })).getByText('Light'))
    const rows = screen.getAllByTestId('log-row')
    expect(rows.map(r => [r.getAttribute('data-badge'), r.getAttribute('data-tag')])).toEqual([['LIGHT', 'close_turn']])
    const light = rows[0]!
    expect(light.getAttribute('data-choice')).toBe('close_turn')
    expect(light.getAttribute('data-seq')).toBe('3')
    expect(light.getAttribute('data-moment')).toBe('soundsFinished')
    expect(light.getAttribute('data-ms')).toBe('640')
    // With none of your words on the page, it belongs to no turn, and a turn cannot end without them.
    expect(screen.getByTestId('log-loose')).toBeTruthy()
  })

  it('explains the Adaptive voice by what the light model does when it is on, and as plain voice when it is off', async () => {
    await page()
    openSettings()
    fireEvent.click(screen.getByLabelText('About Adaptive voice'))
    const on = screen.getByRole('dialog', { name: 'Adaptive voice' })
    expect(on.textContent).toMatch(/small, fast model listens/)
    expect(on.textContent).toMatch(/Off:.*plain voice/)
    expect(on.textContent).not.toMatch(/one stored phrase/)
  })
})
