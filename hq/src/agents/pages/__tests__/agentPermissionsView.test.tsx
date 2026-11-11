// @vitest-environment jsdom
/** The permissions view (every screen reviewed spec §3, *An agent's permissions*): one view at every level. */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'

// ui resolves its own copy of lucide-react; its icons are mocked by that path.
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/agents')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), Search: icon, ChevronDown: icon, Loader2: icon, Plus: icon, Bot: icon, Check: icon }
})
import { AgentPermissionsView, PermissionsSummary, organisationDraft, narrowingDraft } from '@agenthix/ui/agents'
import { here, organisation } from './permissionsFixtures'

const toggle = (name: string) => within(screen.getByRole('group', { name }))
const pressed = (name: string) => toggle(name).getAllByRole('button').filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent)
const offered = (name: string) => toggle(name).getAllByRole('button').map(b => b.textContent)

function organisationView(over = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined)
  const initial = organisationDraft(organisation(over))
  render(<AgentPermissionsView initial={initial} agentName="Frontend dev" canChange onSave={onSave} onCancel={() => {}} />)
  return onSave
}

describe('the organisation’s permissions @SC-618', () => {
  it('shows approval first as three cards, Bypassed marked as a warning, then presets, then the tools in groups', () => {
    organisationView()
    const cards = within(screen.getByRole('group', { name: 'Approval' })).getAllByRole('button')
    expect(cards.map(c => c.querySelector('b')?.textContent)).toEqual(['⚠ Bypassed', 'Deferred', 'Immediate'])
    expect(cards[0].textContent).toContain('Every tool runs, including tools set to Never. No one is asked. In Agenthix it can only do what the person it works for may do.')
    expect(cards[1].getAttribute('aria-pressed')).toBe('true')
    const labels = ['Start from a preset', 'Files', 'Commands', 'Web', 'Platform'].map(t => screen.getByText(t, { selector: 'p, span' }))
    labels.slice(1).forEach((el, i) => expect(labels[i].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy())
    expect(offered('Read')).toEqual(['Always', 'Ask', 'Never'])
    expect(pressed('Edit')).toEqual(['Ask'])
    expect(pressed('Any other command')).toEqual(['Ask'])
    expect(screen.getByRole('button', { name: '＋ Add a command pattern' })).toBeTruthy()
  })

  it('selects the preset that matches and Custom once a tool is changed', () => {
    organisationView()
    const preset = () => within(screen.getByRole('group', { name: 'Preset' })).getAllByRole('button').filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent)
    expect(preset()).toEqual(['Custom'])
    fireEvent.click(screen.getByRole('button', { name: /read only/i }))
    expect(preset()).toEqual([expect.stringMatching(/read only/i)])
    expect(pressed('Edit')).toEqual(['Never'])
    fireEvent.click(within(screen.getByRole('group', { name: 'Edit' })).getByText('Ask'))
    expect(preset()).toEqual(['Custom'])
    expect(screen.queryByRole('button', { name: "The organisation's" })).toBeNull()
  })

  it('hides the tool list with Bypassed, and asks for confirmation before saving it', async () => {
    const onSave = organisationView()
    fireEvent.click(within(screen.getByRole('group', { name: 'Approval' })).getAllByRole('button')[0])
    expect(screen.queryByRole('region', { name: 'Files' })).toBeNull()
    expect(screen.getByText(/there is no list to set/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText('Bypass approval for Frontend dev?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('group', { name: 'Approval' })).getAllByRole('button')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bypass approval' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ approval: 'bypassed' })))
  })

  it('saves another approval without asking, and a new command pattern with the list', async () => {
    const onSave = organisationView()
    fireEvent.click(screen.getByRole('button', { name: '＋ Add a command pattern' }))
    fireEvent.change(screen.getByLabelText('Command pattern'), { target: { value: 'git status' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Approval' })).getAllByRole('button')[2])
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    const sent = onSave.mock.calls[0][0]
    expect(sent.approval).toBe('immediate')
    expect(sent.allowedBashPatterns).toContainEqual({ pattern: 'git status', state: 'always' })
    expect(sent.allowedTools.map((t: { name: string }) => t.name)).not.toContain('ping')
  })

  it('summarises approval, preset and each group, with a warning mark when bypassed', () => {
    const { unmount } = render(<PermissionsSummary data={organisation()} />)
    expect(screen.getByText('Deferred')).toBeTruthy()
    expect(screen.getByText('Custom')).toBeTruthy()
    expect(screen.getByText('Any other command ask · 2 patterns')).toBeTruthy()
    expect(screen.getByText('1 of 2 on')).toBeTruthy()
    expect(screen.queryByText('⚠ Approval bypassed')).toBeNull()
    unmount()
    render(<PermissionsSummary data={organisation({ approval: 'bypassed' })} />)
    expect(screen.getByText('⚠ Approval bypassed')).toBeTruthy()
    expect(screen.getByText('Not used while approval is bypassed')).toBeTruthy()
  })
})

describe('a project’s or a person’s permissions @SC-619', () => {
  function narrowingView(data = here(), canChange = true) {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<AgentPermissionsView initial={narrowingDraft(data)} agentName="Frontend dev" title="Permissions here" canChange={canChange} onSave={onSave} readOnlyNote="Only admins change these." />)
    return onSave
  }

  it('offers only the organisation’s choice and stricter ones, with the organisation’s setting under each', () => {
    narrowingView()
    expect(offered('Read')).toEqual(['Always', 'Ask', 'Never'])
    expect(offered('Edit')).toEqual(['Ask', 'Never'])
    expect(offered('Search the web')).toEqual(['Never'])
    expect(within(screen.getByRole('group', { name: 'Approval' })).getAllByRole('button').map(b => b.querySelector('b')?.textContent)).toEqual(['Deferred', 'Immediate'])
    expect(screen.getByText('Organisation: Deferred')).toBeTruthy()
    expect(screen.getAllByText(/Organisation: Ask/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: "The organisation's" })).toBeTruthy()
    expect(screen.getByRole('button', { name: '＋ Block a command here' })).toBeTruthy()
  })

  it('marks a change as narrowed, counts it at the top and saves only what it narrows', async () => {
    const onSave = narrowingView()
    expect(screen.getByText('Nothing narrowed')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: 'Fetch a page' })).getByText('Never'))
    fireEvent.click(within(screen.getByRole('group', { name: 'Approval' })).getByText('Immediate').closest('button')!)
    expect(screen.getByText('2 narrowed')).toBeTruthy()
    expect(screen.getAllByText('narrowed').length).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ approval: 'immediate', allowedTools: [{ name: 'web_fetch', state: 'never' }], allowedBashPatterns: null }))
  })

  it('is read only for someone who may not change it', () => {
    narrowingView(here({ web_fetch: 'never' }), false)
    expect(toggle('Fetch a page').getAllByRole('button').every(b => (b as HTMLButtonElement).disabled)).toBe(true)
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    fireEvent.mouseEnter(toggle('Fetch a page').getAllByRole('button')[0])
    expect(screen.getByTestId('tooltip').textContent).toBe('Only admins change these.')
    expect(screen.getByText('1 narrowed')).toBeTruthy()
  })

  it('shows Organisation: Bypassed and starts every tool at Always when the organisation bypasses and this level does not', () => {
    const data = here({}, { organisationBypassed: true, approval: { organisation: 'bypassed', here: 'deferred', effective: 'deferred', narrowed: true } })
    data.tools = data.tools.map(t => ({ ...t, organisation: 'always', effective: 'always', here: null }))
    narrowingView(data)
    expect(screen.getAllByText(/Organisation: Bypassed/).length).toBeGreaterThan(1)
    expect(pressed('Edit')).toEqual(['Always'])
    expect(offered('Edit')).toEqual(['Always', 'Ask', 'Never'])
  })

  it('shows no tool list while the organisation bypasses and this level leaves it', () => {
    narrowingView(here({}, { organisationBypassed: true, approval: { organisation: 'bypassed', here: null, effective: 'bypassed', narrowed: false } }))
    expect(screen.queryByRole('region', { name: 'Files' })).toBeNull()
    expect(within(screen.getByRole('group', { name: 'Approval' })).getAllByRole('button')).toHaveLength(3)
  })
})
