// @vitest-environment jsdom
/** The provider card core, what a provider's line opens into: state in words, the runtime line, and the place's own parts. */
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { AI_PROVIDER_VENDOR_INFO, type AiProviderState, type AiProviderVendor } from '@agenthix/core'
import { ProviderCardCore } from '../ProviderCardCore'

afterEach(cleanup)

const provider = (vendor: AiProviderVendor, state: AiProviderState = 'works', stateDetail: string | null = null) => ({
  id: `p-${vendor}`, name: AI_PROVIDER_VENDOR_INFO[vendor].label, vendor, credential: AI_PROVIDER_VENDOR_INFO[vendor].credential,
  types: [...AI_PROVIDER_VENDOR_INFO[vendor].types], state, stateDetail,
})
const card = (p: ReturnType<typeof provider>, extra: Partial<React.ComponentProps<typeof ProviderCardCore>> = {}) =>
  render(<ProviderCardCore provider={p} {...extra} />)

describe('the provider card core', () => {
  it('says its state in words, with the place\'s note after it', () => {
    card(provider('inworld'), { stateNote: 'Added by you.' })
    expect(screen.getByText('Works. Added by you.')).toBeTruthy()
  })

  it('says which runtime agents run its models on', () => {
    card(provider('anthropic'))
    expect(screen.getByText(/Agents run its models on/).textContent).toBe('Agents run its models on Claude Code')
    cleanup()
    card(provider('openrouter'))
    expect(screen.getByText(/Agents run its models on/).textContent).toBe('Agents run its models on OpenCode')
  })

  it('has no runtime line for a provider that only hears or speaks', () => {
    card(provider('assemblyai'))
    expect(screen.queryByText(/Agents run its models on/)).toBeNull()
  })

  it('says a state that does not work in words, with the vendor’s own message', () => {
    card(provider('openrouter', 'key_refused', 'Invalid API key'))
    expect(screen.getByText('The key was refused. OpenRouter says: Invalid API key')).toBeTruthy()
  })

  it('draws what the place adds under the core, then its buttons, then what they opened', () => {
    card(provider('openrouter'), { actions: <button type="button">Remove</button>, children: <p>key ending …a3f9</p>, after: <p>The history</p> })
    const order = [screen.getByText('key ending …a3f9'), screen.getByRole('button', { name: 'Remove' }), screen.getByText('The history')]
    for (let i = 1; i < order.length; i++) expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
