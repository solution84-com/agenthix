// @vitest-environment jsdom
/** What agents can do on the AI page when its reads do not come back: one nudge, never "Loading…" for ever, never "no key". */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { AI_PROVIDER_VENDOR_INFO } from '@agenthix/core'

type Q = { data: unknown; error: unknown; dataUpdatedAt: number; refetch: () => void }
const h = vi.hoisted(() => ({ q: {} as Record<string, unknown> }))
vi.mock('wasp/client/operations', () => ({
  getAiProviders: 'providers', getModelsSettings: 'settings', getWebSearchKeyStatus: 'key', setModelDefaults: 'defaults',
  useQuery: (op: string) => h.q[op],
  useAction: () => vi.fn(),
}))
vi.mock('../../../admin/useScrollToHash', () => ({ useScrollToHash: () => undefined }))
vi.mock('../../../shared/components/models/ModelPicker', () => ({ ModelPicker: () => null }))
vi.mock('../../../models-settings/components/ListeningRow', () => ({ HearingChange: () => null }))
vi.mock('../../../models-settings/components/VoiceRow', () => ({ SpeakingChange: () => null }))
vi.mock('../WebSearchKeyDialog', () => ({ WebSearchKeyDialog: () => null }))

import { CapabilitiesSection } from '../CapabilitiesSection'

afterEach(cleanup)

const failure = new Error('HQ did not answer')
const ok = (data: unknown, at = Date.now()): Q => ({ data, error: null, dataUpdatedAt: at, refetch: vi.fn() })
const down = (data?: unknown, at = Date.now()): Q => ({ data, error: failure, dataUpdatedAt: at, refetch: vi.fn() })
const anthropic = { vendor: 'anthropic', credential: AI_PROVIDER_VENDOR_INFO.anthropic.credential, types: [...AI_PROVIDER_VENDOR_INFO.anthropic.types], state: 'works' }
const settings = { conversation: null, stt: null, tts: null, choices: { models: [], recent: [] }, stt_options: [], tts_options: [] }
const use = (providers: Q, defaults: Q, key: Q) => { h.q = { providers, settings: defaults, key } }
const press = () => render(<CapabilitiesSection onAddProvider={vi.fn()} onOpenProvider={vi.fn()} />)

describe('What agents can do, when reads do not come back', () => {
  it('says the providers read did not come back, instead of "Loading…" for ever', () => {
    use(down(), ok(settings), ok({ present: false }))
    press()
    expect(screen.getByText('What agents can do could not be read')).toBeTruthy()
    expect(screen.queryByText('Loading…')).toBeNull()
  })

  it('keeps Thinking, Hearing and Speaking when only the key read fails, and says so on the Web search line', () => {
    use(ok([anthropic]), ok(settings), down())
    press()
    expect(screen.getByRole('listitem', { name: 'Thinking' })).toBeTruthy()
    const line = screen.getByRole('listitem', { name: 'Web search' })
    expect(line.textContent).toContain('could not be read')
    expect(line.textContent).not.toContain('needs a search key')
    expect(screen.queryByRole('button', { name: /Add a key/ })).toBeNull()
  })

  it('shows one nudge, not two, when the defaults and the key reads both fail', () => {
    use(ok([anthropic]), down(), down())
    press()
    expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1)
  })

  it('shows one "Not up to date" line, beside the heading, when held data is stale and several reads fail', () => {
    const old = Date.now() - 5 * 60_000
    use(down([anthropic], old), down(settings, old), down({ present: true }, old))
    press()
    expect(screen.getAllByText(/Not up to date/)).toHaveLength(1)
    const heading = screen.getByRole('heading', { name: 'What agents can do' })
    expect(heading.parentElement?.textContent).toContain('Not up to date')
  })
})
