// @vitest-environment jsdom
/** Setup's list of what agents can do: a key read that did not come back is never "OpenCode needs a search key". */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { AI_PROVIDER_VENDOR_INFO } from '@agenthix/core'

const h = vi.hoisted(() => ({ key: {} as Record<string, unknown> }))
vi.mock('wasp/client/operations', () => ({
  getSetupDefaults: 'defaults', getWebSearchKeyStatus: 'key',
  useQuery: (op: string) => (op === 'key' ? h.key : { data: { conversation: null, stt: null, tts: null }, error: null, dataUpdatedAt: Date.now(), refetch: vi.fn() }),
}))

import { WhatAgentsCanDo } from '../../../../capabilities/components/WhatAgentsCanDo'
import { useCapabilities } from '../useCapabilities'

afterEach(cleanup)

const opencode = { id: 'p', name: 'OpenRouter', vendor: 'openrouter' as const, credential: AI_PROVIDER_VENDOR_INFO.openrouter.credential, types: [...AI_PROVIDER_VENDOR_INFO.openrouter.types], state: 'works' as const }
function List() {
  const { capabilities, unread } = useCapabilities([opencode] as never)
  return <WhatAgentsCanDo capabilities={capabilities} unread={unread} onAction={vi.fn()} />
}

describe('setup: what agents can do @SC-2139 @SC-2144', () => {
  it('says the key read did not come back, on the Web search line, instead of "needs a search key"', () => {
    h.key = { data: undefined, error: new Error('HQ did not answer'), dataUpdatedAt: 0, refetch: vi.fn() }
    render(<List />)
    const line = screen.getByRole('listitem', { name: 'Web search' })
    expect(line.textContent).toContain('could not be read')
    expect(line.textContent).not.toContain('needs a search key')
    expect(screen.queryByRole('button', { name: /Add a key/ })).toBeNull()
  })

  it('says "needs a search key" once the read has answered that there is none', () => {
    h.key = { data: { present: false }, error: null, dataUpdatedAt: Date.now(), refetch: vi.fn() }
    render(<List />)
    expect(screen.getByRole('listitem', { name: 'Web search' }).textContent).toContain('OpenCode needs a search key.')
  })
})
