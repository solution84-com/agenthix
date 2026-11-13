// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const h = vi.hoisted(() => ({ cloud: undefined as unknown, add: vi.fn() }))
vi.mock('wasp/client/operations', async () => {
  const { featuresAnswer } = await import('../../../test/featuresAnswer')
  return {
    addAiProvider: 'addAiProvider', getHqCloudConnection: 'getHqCloudConnection', connectHqToCloud: 'connectHqToCloud', disconnectHqFromCloud: 'disconnectHqFromCloud',
    getFeatures: 'getFeatures',
    useAction: () => h.add,
    useQuery: (op: string) => ({ data: op === 'getFeatures' ? featuresAnswer() : h.cloud, error: undefined, refetch: vi.fn() }),
  }
})
vi.mock('@agenthix/ui/primitives', () => ({
  BUTTON_SECONDARY: '', DISABLED: '', FOCUS_RING: '', FOCUS_RING_INSET: '', FIELD: '', FIELD_BOX: '', ROW_ITEM: '', ROW_CHOSEN: '', CARD_CLICKABLE: '', CARD_CHOSEN: '',
  Button: (p: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...p} />,
  Input: (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} />,
  AttentionDialog: () => null,
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormField: ({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) => <label>{label}<span>{hint}</span>{children}{error && <span role="alert">{error}</span>}</label>,
}))

import { AddProviderForm } from '../AddProviderDialog'
import { addableVendors } from '../VendorChoices'
import { withFeature } from '@agenthix/core/testing'

const show = (existing: Array<'anthropic' | 'inworld'> = []) => render(<AddProviderForm existingVendors={existing} onAdded={vi.fn()} onCancel={vi.fn()} />)
const CLOUD_OFF = { connection: null, connecting: null, lastAttempt: null, problem: null, runByCloud: false, aiAvailable: false }

afterEach(() => { cleanup(); h.cloud = CLOUD_OFF; h.add.mockReset() })

describe('the vendor list @SC-1843 @SC-1935', () => {
  it('lists every vendor directly with what it covers, and no question about the type', () => {
    h.cloud = CLOUD_OFF
    show()
    expect(screen.queryByText(/What does the provider do/)).toBeNull()
    for (const name of ['Anthropic', 'OpenAI', 'Google Gemini', 'OpenRouter', 'Inworld', 'AssemblyAI', 'Your own OpenAI-compatible endpoint']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${name}`) })).toBeTruthy()
    }
    // Agenthix Cloud is offered only while its flag is on (adr-0189).
    expect(screen.queryByRole('button', { name: /^Agenthix Cloud/ })).toBeNull()
    expect(screen.getByText('Models, hearing and speaking: one key for all three')).toBeTruthy()
    expect(screen.getByText('Hearing people')).toBeTruthy()
  })

  it('adds a vendor once, and Agenthix Cloud is not a keyed vendor', () => {
    expect(addableVendors(['inworld'])).not.toContain('inworld')
    expect(addableVendors([])).not.toContain('cloud')
  })

  withFeature('cloud', () => {
    it('shows Agenthix Cloud disabled as not available yet, and enabled once it is', () => {
      h.cloud = CLOUD_OFF
      show()
      expect((screen.getByRole('button', { name: /Agenthix Cloud/ }) as HTMLButtonElement).disabled).toBe(true)
      expect(screen.getByText('Not available yet')).toBeTruthy()
      cleanup()
      h.cloud = { ...CLOUD_OFF, aiAvailable: true }
      show()
      expect((screen.getByRole('button', { name: /Agenthix Cloud/ }) as HTMLButtonElement).disabled).toBe(false)
    })
  })

  it('says Inworld offers models too, with no switch @SC-1851', () => {
    h.cloud = CLOUD_OFF
    show()
    expect(screen.getByText('Models, hearing and speaking: one key for all three')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Inworld/ }))
    expect(screen.getByText(/This one key covers models, hearing people and speaking/)).toBeTruthy()
  })
})

describe('the key guide', () => {
  const guide = () => screen.getByRole('region', { name: 'Where to get the key' })
  const open = (vendor: RegExp) => { h.cloud = CLOUD_OFF; show(); fireEvent.click(screen.getByRole('button', { name: vendor })) }

  it('names the vendor, gives three steps and a key-page link that opens in a new tab @SC-1847', () => {
    open(/^OpenRouter/)
    expect(screen.getByText('Where do I get an OpenRouter key?')).toBeTruthy()
    expect(guide().querySelectorAll('ol li')).toHaveLength(3)
    const link = screen.getByRole('link', { name: /Open OpenRouter’s key page/ }) as HTMLAnchorElement
    expect(link.href).toBe('https://openrouter.ai/settings/keys')
    expect(link.target).toBe('_blank')
    expect(link.rel).toBe('noopener noreferrer')
  })

  it('has the Claude plan note on Anthropic’s form only @SC-1847', () => {
    open(/^Anthropic/)
    expect(screen.getByText(/A Claude Pro or Max plan is not an API key/)).toBeTruthy()
    cleanup()
    open(/^OpenAI/)
    expect(screen.queryByText(/Claude Pro or Max/)).toBeNull()
  })

  it('tells Inworld’s person to copy the value labelled Basic (Base64) @SC-1847', () => {
    open(/^Inworld/)
    expect(screen.getByText('On the key’s page, copy the value labelled Basic (Base64) and paste it below.')).toBeTruthy()
  })

  it('has no guide for a person’s own endpoint, which keeps its Address field @SC-1847', () => {
    open(/^Your own OpenAI-compatible endpoint/)
    expect(screen.queryByRole('region', { name: 'Where to get the key' })).toBeNull()
    expect(screen.getByText('Address')).toBeTruthy()
  })

  it('keeps what was typed while the guide is there @SC-1847', () => {
    open(/^Anthropic/)
    fireEvent.change(screen.getByLabelText(/API key/), { target: { value: 'sk-test-fake-key' } })
    expect((screen.getByLabelText(/API key/) as HTMLInputElement).value).toBe('sk-test-fake-key')
  })

  it('shows a refusal under the key, as the server worded it @SC-1848', async () => {
    h.add.mockRejectedValue(Object.assign(new Error('Anthropic refused this key. Check that you copied all of it and that the account has credit, then try again. Anthropic says: invalid x-api-key'), { statusCode: 400 }))
    open(/^Anthropic/)
    fireEvent.change(screen.getByLabelText(/API key/), { target: { value: 'sk-test-fake-key' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/^Anthropic refused this key\. Check that you copied all of it/)).toBeTruthy()
  })

  it('announces a refusal and ties it to the key field @SC-1848 @SC-1912', async () => {
    h.add.mockRejectedValue(Object.assign(new Error('Anthropic refused this key.'), { statusCode: 400 }))
    open(/^Anthropic/)
    fireEvent.change(screen.getByLabelText(/API key/), { target: { value: 'sk-test-fake-key' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const alert = await screen.findByRole('status')
    const field = screen.getByLabelText(/API key/)
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(field.getAttribute('aria-describedby')).toBe(alert.id)
  })

  it('moves focus to the first vendor, then to the Name field, then back to the first vendor', () => {
    open(/^Anthropic/)
    expect(document.activeElement?.id).toBe('provider-name')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(document.activeElement?.textContent).toMatch(/^Anthropic/)
  })

  it('leaves out the line about admins being told when asked, and says it otherwise', () => {
    h.cloud = CLOUD_OFF
    render(<AddProviderForm existingVendors={[]} onAdded={vi.fn()} onCancel={vi.fn()} adminNotice={false} />)
    fireEvent.click(screen.getByRole('button', { name: /^Anthropic/ }))
    expect(screen.queryByText(/Every organisation admin is told/)).toBeNull()
    cleanup()
    open(/^Anthropic/)
    expect(screen.getByText(/Every organisation admin is told/)).toBeTruthy()
  })

  it('says an own endpoint is checked with this server', () => {
    open(/^Your own OpenAI-compatible endpoint/)
    expect(screen.getByText(/Checked with this server when you save/)).toBeTruthy()
  })
})
