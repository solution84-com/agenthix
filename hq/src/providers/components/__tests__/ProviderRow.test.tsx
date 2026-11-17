// @vitest-environment jsdom
/** A provider's one line: its name, kinds, runtime and state; a provider that isn't working; opening it in place. */
import React, { useState } from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { AI_PROVIDER_VENDOR_INFO, type AiProviderState, type AiProviderVendor } from '@agenthix/core'
import { ProviderRow, rowSummary } from '../ProviderRow'

afterEach(cleanup)

const provider = (vendor: AiProviderVendor, state: AiProviderState = 'works') => ({
  id: `p-${vendor}`, name: AI_PROVIDER_VENDOR_INFO[vendor].label, vendor, credential: AI_PROVIDER_VENDOR_INFO[vendor].credential,
  types: [...AI_PROVIDER_VENDOR_INFO[vendor].types], state, stateDetail: state === 'works' ? null : 'invalid key',
})

function Row({ p }: { p: ReturnType<typeof provider> }) {
  const [open, setOpen] = useState(false)
  return <ul><ProviderRow provider={p} open={open} onToggle={() => setOpen(o => !o)}><p>The details</p></ProviderRow></ul>
}

describe('a provider\'s line @SC-2146 @SC-2138', () => {
  it('says the name, its kinds in the capability words, the runtime and the state', () => {
    render(<Row p={provider('inworld')} />)
    const line = screen.getByRole('button', { expanded: false })
    expect(line.textContent).toBe('InworldThinking, Hearing, Speaking · OpenCodeWorks')
  })

  it('has no runtime for a provider that only hears, and names both runtimes when it has two', () => {
    expect(rowSummary(provider('assemblyai'))).toBe('Hearing')
    expect(rowSummary(provider('anthropic'))).toBe('Thinking · Claude Code')
    expect(rowSummary({ ...provider('cloud'), credential: 'none' })).toBe('Thinking, Hearing, Speaking · Claude Code and OpenCode')
  })

  it('stands out in the danger colour with its reason when the provider isn\'t working', () => {
    render(<Row p={provider('openrouter', 'key_refused')} />)
    expect(screen.getByRole('button').textContent).toContain('Key refused')
    expect(screen.getByRole('listitem').className).toContain('border-danger')
    cleanup()
    render(<Row p={provider('openrouter')} />)
    expect(screen.getByRole('listitem').className).not.toContain('danger')
  })

  it('stays quiet for Agenthix Cloud while it is not available, which is not a fault', () => {
    render(<Row p={{ ...provider('cloud', 'not_available'), credential: 'none' }} />)
    expect(screen.getByRole('button').textContent).toContain('Not available yet')
    expect(screen.getByRole('listitem').className).not.toContain('danger')
  })

  it('opens in place when pressed, and closes when pressed again', () => {
    render(<Row p={provider('openrouter')} />)
    const line = screen.getByRole('button')
    expect(screen.queryByText('The details')).toBeNull()
    fireEvent.click(line)
    expect(line.getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById(line.getAttribute('aria-controls')!)?.textContent).toBe('The details')
    fireEvent.click(line)
    expect(line.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('The details')).toBeNull()
  })

  it('carries the provider\'s anchor, so a link can open it', () => {
    render(<Row p={provider('openrouter')} />)
    expect(screen.getByRole('listitem').id).toBe('provider-p-openrouter')
  })
})
