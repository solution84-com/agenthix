// @vitest-environment jsdom
/** What agents can do, drawn: marks, lines, the runtimes under Web search, its help, and the actions. */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import { AI_PROVIDER_VENDOR_INFO, type AiProviderVendor } from '@agenthix/core'
import { capabilityList } from '../../capabilityList'
import { WhatAgentsCanDo, WhatAgentsCanDoShort } from '../WhatAgentsCanDo'

afterEach(cleanup)

const provider = (vendor: AiProviderVendor) => ({ vendor, credential: AI_PROVIDER_VENDOR_INFO[vendor].credential, types: [...AI_PROVIDER_VENDOR_INFO[vendor].types], state: 'works' as const })
const choice = (text: string) => ({ providerId: 'p', model: 'm', text, notWorking: false })
const mixed = capabilityList({
  providers: [provider('anthropic'), provider('openrouter')],
  defaults: { conversation: choice('Claude Sonnet 5.5 · via Anthropic'), stt: null, tts: null },
  webSearchKey: false,
})
const row = (name: string) => within(screen.getByRole('listitem', { name }))

describe('What agents can do', () => {
  it('draws each capability with its mark read out, and what agents use', () => {
    render(<WhatAgentsCanDo capabilities={mixed} onAction={vi.fn()} />)
    expect(row('Thinking').getByText('Agents can do it')).toBeTruthy()
    expect(row('Thinking').getByText('Claude Sonnet 5.5 · via Anthropic')).toBeTruthy()
    expect(row('Hearing').getByText('A provider would add it')).toBeTruthy()
    expect(row('Hearing').getByText('Add a provider that hears people.')).toBeTruthy()
    expect(row('Web search').getByText('Only some agents can do it')).toBeTruthy()
  })

  it('lists the runtimes under Web search when more than one is in use', () => {
    render(<WhatAgentsCanDo capabilities={mixed} onAction={vi.fn()} />)
    expect(row('Web search').getByText('Some agents can search.')).toBeTruthy()
    expect(row('Web search').getByText('Claude Code')).toBeTruthy()
    expect(row('Web search').getByText('✓ on its own')).toBeTruthy()
    expect(row('Web search').getByText('needs a search key')).toBeTruthy()
  })

  it('opens the help under the "?" of Web search', () => {
    render(<WhatAgentsCanDo capabilities={mixed} onAction={vi.fn()} />)
    const help = screen.getByRole('button', { name: 'What is a runtime?' })
    expect(help.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(help)
    expect(screen.getByText(/A runtime is the program an agent works in\. Claude Code searches the web on its own\./)).toBeTruthy()
  })

  it('calls back with the capability and its action: Change and Add a key', () => {
    const onAction = vi.fn()
    render(<WhatAgentsCanDo capabilities={mixed} onAction={onAction} />)
    fireEvent.click(screen.getByRole('button', { name: 'Change: Thinking' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add a key: Web search' }))
    expect(onAction.mock.calls).toEqual([['thinking', 'change'], ['web_search', 'add_key']])
  })

  it('offers Add a provider on a line only where the place asks for it', () => {
    const { unmount } = render(<WhatAgentsCanDo capabilities={mixed} onAction={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Add a provider: Hearing' })).toBeNull()
    unmount()
    render(<WhatAgentsCanDo capabilities={mixed} onAction={vi.fn()} offersAddProvider />)
    expect(screen.getByRole('button', { name: 'Add a provider: Hearing' })).toBeTruthy()
  })

  it('draws what the place puts under a line', () => {
    render(<WhatAgentsCanDo capabilities={mixed} onAction={vi.fn()} below={{ thinking: <p>the picker</p> }} />)
    expect(row('Thinking').getByText('the picker')).toBeTruthy()
  })

  it('draws the short form as each capability and its mark', () => {
    render(<WhatAgentsCanDoShort capabilities={mixed} />)
    const items = screen.getAllByRole('listitem').map(li => li.textContent)
    expect(items).toEqual([
      '✓Agents can do itThinking', 'A provider would add itHearing', 'A provider would add itSpeaking', '!Only some agents can do itWeb search',
    ])
  })
})
