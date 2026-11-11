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
  it('says what the agent is doing as the line above the message box does, an icon then words, and the work going @SC-1927', () => {
    h.call = { voice: { ...base, phase: 'speaking', outstanding: 2 }, toggleMute, end }
    render(<App at="/projects" />)
    const link = screen.getByTestId('voice-bar-link')
    expect(link.textContent).toBe('Kernel is speaking · 2 working')
    expect(screen.getByTestId('voice-bar').getAttribute('data-state')).toBe('speaking')
    expect(screen.getByTestId('voice-line-bars')).toBeTruthy()
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
    fireEvent.click(screen.getByRole('button', { name: 'End the call' }))
    expect(toggleMute).toHaveBeenCalled()
    expect(end).toHaveBeenCalled()
  })

  it('has the box’s pair: Mute, then a round End in the danger colour, each saying what pressing does', () => {
    render(<App at="/projects" />)
    const mute = screen.getByRole('button', { name: 'Mute' })
    const stop = screen.getByRole('button', { name: 'End the call' })
    expect(mute.getAttribute('title')).toBe('Mute')
    expect(stop.getAttribute('title')).toBe('End the call')
    // A cross, so it is not mistaken for the square that stops a typed reply.
    expect(stop.querySelector('svg.lucide-x')).not.toBeNull()
    expect(mute.compareDocumentPosition(stop) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(stop.className).toContain('rounded-full')
    expect(stop.className).toContain('bg-button-danger')
    expect(mute.className).toContain('active:bg-surface-pressed')
  })

  it('shows the muted state as the selected fill, and a raised hand left of Mute', () => {
    h.call = { voice: { ...base, muted: true, handRaise: true }, toggleMute, end, runtime: () => null }
    render(<App at="/projects" />)
    const unmute = screen.getByRole('button', { name: 'Unmute' })
    expect(unmute.getAttribute('aria-pressed')).toBe('true')
    expect(unmute.className).toContain('bg-selected')
    const hand = screen.getByTestId('voice-bar-hand-raised')
    expect(hand.compareDocumentPosition(unmute) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('says muted only by Mute\'s own selected state: the words stay what the agent is doing', () => {
    h.call = { voice: { ...base, muted: true }, toggleMute, end }
    render(<App at="/projects" />)
    expect(screen.getByTestId('voice-bar-link').textContent).toBe('Kernel is listening')
    expect(screen.getByRole('button', { name: 'Unmute' }).getAttribute('aria-pressed')).toBe('true')
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

  it('says Reconnecting… while reconnecting, and dims the mic with the reason in its tooltip and its description', () => {
    h.call = { voice: { ...base, reconnecting: true }, toggleMute, end }
    render(<App at="/projects" />)
    expect(screen.getByTestId('voice-bar-link').textContent).toBe('Reconnecting…')
    const mute = screen.getByRole('button', { name: 'Mute' })
    expect(mute.className).toContain('opacity-40')
    expect(document.getElementById(mute.getAttribute('aria-describedby') ?? '')?.textContent).toMatch(/^Reconnecting/)
    fireEvent.mouseEnter(mute)
    expect(screen.getByTestId('tooltip').textContent).toMatch(/^Reconnecting/)
    fireEvent.click(mute)
    expect(toggleMute).toHaveBeenCalled()
  })
})
