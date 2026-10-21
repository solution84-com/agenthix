// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router'

const h = vi.hoisted(() => ({ call: {} as Record<string, unknown> }))
vi.mock('../../providers/VoiceCallProvider', () => ({ useVoiceCall: () => h.call }))
vi.mock('../../components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => <i /> }))

import { VoiceBar } from '../VoiceBar'
import { DockContext, type DockValue } from '../../../dock/DockContext'
import type { DockWidth } from '../../../dock/useDockWidth'

const base = {
  conversationId: 'c1', agent: { name: 'Kernel', avatarUrl: null }, returnTo: '/chat/c/c1', phase: 'listening', muted: false,
  partial: '', reveal: null, warningEndsAt: null, notice: null, noticeFor: null, outstanding: null,
}
const toggleMute = vi.fn()
const end = vi.fn()

beforeEach(() => {
  toggleMute.mockReset(); end.mockReset()
  h.call = { voice: base, toggleMute, end }
})
afterEach(cleanup)

function App({ at }: { at: string }) {
  return (
    <MemoryRouter initialEntries={[at]}>
      <VoiceBar />
      <Link to="/projects">Projects</Link>
      <Link to="/chat/c/c1">Thread</Link>
      <Routes><Route path="*" element={<p>page</p>} /></Routes>
    </MemoryRouter>
  )
}

describe('the voice bar on other pages @SC-1001', () => {
  it('shows the agent, who is talking and the work going, on a page that is not the thread', () => {
    h.call = { voice: { ...base, phase: 'speaking', outstanding: 2 }, toggleMute, end }
    render(<App at="/projects" />)
    const bar = screen.getByTestId('voice-bar')
    expect(bar.textContent).toContain('Kernel')
    expect(bar.textContent).toContain('Kernel is speaking')
    expect(bar.textContent).toContain('2 working')
  })

  it('is not there on the thread itself, and not when voice is off', () => {
    render(<App at="/chat/c/c1" />)
    expect(screen.queryByTestId('voice-bar')).toBeNull()
    cleanup()
    h.call = { voice: { ...base, phase: 'off' }, toggleMute, end }
    render(<App at="/projects" />)
    expect(screen.queryByTestId('voice-bar')).toBeNull()
  })

  it('stays across navigation and goes away on the thread', () => {
    render(<App at="/projects" />)
    expect(screen.getByTestId('voice-bar')).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'Thread' }))
    expect(screen.queryByTestId('voice-bar')).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'Projects' }))
    expect(screen.getByTestId('voice-bar')).toBeTruthy()
  })

  it('leads back to the thread when clicked', () => {
    render(<App at="/projects" />)
    expect(screen.getByRole('link', { name: /Kernel/ }).getAttribute('href')).toBe('/chat/c/c1')
  })

  it('mutes and ends voice', () => {
    render(<App at="/projects" />)
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }))
    fireEvent.click(screen.getByRole('button', { name: 'End' }))
    expect(toggleMute).toHaveBeenCalled()
    expect(end).toHaveBeenCalled()
  })

  it('says muted while muted', () => {
    h.call = { voice: { ...base, muted: true }, toggleMute, end }
    render(<App at="/projects" />)
    expect(screen.getByTestId('voice-bar').textContent).toContain('Muted')
    expect(screen.getByRole('button', { name: 'Unmute' })).toBeTruthy()
  })
})

describe('the voice bar beside the dock', () => {
  const dockWith = (conversationId: string | null, width: DockWidth = 'wide'): DockValue => ({
    open: conversationId ? { conversationId, basePath: null } : null,
    width,
    draft: null,
    openConversation: () => {},
    startNew: () => {},
    close: () => {},
    position: 'docked',
    setPosition: () => {},
  })
  function Docked({ at, dock }: { at: string; dock: DockValue }) {
    return <DockContext.Provider value={dock}><App at={at} /></DockContext.Provider>
  }

  it('is not there while the call’s conversation is open in the dock, on any page', () => {
    render(<Docked at="/projects?c=c1" dock={dockWith('c1')} />)
    expect(screen.queryByTestId('voice-bar')).toBeNull()
  })

  it('is there while another conversation is in the dock, even on the page the call started from', () => {
    render(<Docked at="/chat/c/c1" dock={dockWith('c2')} />)
    expect(screen.getByTestId('voice-bar')).toBeTruthy()
  })

  it('opens the call’s conversation in the dock when clicked, the canvas staying', () => {
    render(<Docked at="/projects?c=c2" dock={dockWith('c2')} />)
    expect(screen.getByRole('link', { name: /Kernel/ }).getAttribute('href')).toBe('/projects?c=c1')
  })

  it.each(['narrow', 'medium'] as const)('goes by the dock on a %s window too, not by the call’s page', (width) => {
    render(<Docked at="/chat/c/c1" dock={dockWith('c2', width)} />)
    expect(screen.getByRole('link', { name: /Kernel/ }).getAttribute('href')).toBe('/chat/c/c1?c=c1')
    cleanup()
    render(<Docked at="/projects" dock={dockWith('c1', width)} />)
    expect(screen.queryByTestId('voice-bar')).toBeNull()
  })
})

describe('the voice bar: a raised hand and a reconnecting connection', () => {
  it('shows the badge, and a tap on it is the person’s invitation', () => {
    const publish = vi.fn()
    h.call = { voice: { ...base, handRaise: { updateId: 'u1', critical: false } }, toggleMute, end, runtime: () => ({ publish, now: () => 42 }) }
    render(<App at="/projects" />)
    fireEvent.click(screen.getByRole('button', { name: 'Kernel has an update. Tap to hear it now.' }))
    expect(publish).toHaveBeenCalledWith({ kind: 'person.tap', target: 'hand-raise', t: 42 })
  })

  it('says "Reconnecting…" in place of who is talking', () => {
    h.call = { voice: { ...base, reconnecting: true }, toggleMute, end }
    render(<App at="/projects" />)
    expect(screen.getByTestId('voice-bar').textContent).toContain('Reconnecting…')
  })
})
