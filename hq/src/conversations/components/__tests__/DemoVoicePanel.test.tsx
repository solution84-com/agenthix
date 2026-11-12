// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const h = vi.hoisted(() => ({ info: undefined as unknown, phase: 'listening', say: vi.fn() as ((l: unknown) => void) | undefined }))
vi.mock('wasp/client/operations', () => ({
  getDemoInfo: 'getDemoInfo',
  useQuery: () => ({ data: h.info }),
}))
vi.mock('../../../shared/providers/VoiceCallProvider', () => ({
  useVoiceCall: () => ({ voice: { phase: h.phase }, say: h.say }),
}))

import { DEMO_VOICE_LABEL, DemoVoicePanel } from '../DemoVoicePanel'

const info = {
  on: true, nextResetAt: '', agents: { writer: {
    suggestedPrompts: [], spokenLines: [],
    firstVoiceLine: { text: 'Hello, I am Writer. This is a demo voice, so pick a line below.', clip: 'writer-first.mp3' },
    voiceLines: [{ id: 'a', text: 'What do you write?', clip: 'writer-a.mp3' }, { id: 'b', text: 'Start the case-study page', clip: null }],
  } },
}

beforeEach(() => { h.info = info; h.phase = 'listening'; h.say = vi.fn() })
afterEach(cleanup)

describe("the demo's voice screen @SC-1961", () => {
  it('says it is a demo, shows what the agent said first, and offers the lines as buttons', () => {
    render(<DemoVoicePanel agentHandle="writer" agentName="Writer" />)
    expect(screen.getByTestId('demo-voice-label').textContent).toBe(DEMO_VOICE_LABEL)
    expect(DEMO_VOICE_LABEL).toBe('Demo voice — scripted lines, nothing you say is listened to')
    expect(screen.getByTestId('demo-voice-first').textContent).toContain('This is a demo voice')
    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(['What do you write?', 'Start the case-study page'])
  })

  it('a tap says the line with its clip', () => {
    render(<DemoVoicePanel agentHandle="writer" agentName="Writer" />)
    fireEvent.click(screen.getByRole('button', { name: 'What do you write?' }))
    expect(h.say).toHaveBeenCalledWith({ text: 'What do you write?', clip: 'writer-a.mp3' })
    fireEvent.click(screen.getByRole('button', { name: 'Start the case-study page' }))
    expect(h.say).toHaveBeenLastCalledWith({ text: 'Start the case-study page', clip: null })
  })

  it('the buttons wait while the agent is speaking or thinking', () => {
    h.phase = 'speaking'
    render(<DemoVoicePanel agentHandle="writer" agentName="Writer" />)
    for (const b of screen.getAllByRole('button')) expect((b as HTMLButtonElement).disabled).toBe(true)
  })

  it('has no buttons for an agent with no lines, and still carries the label', () => {
    render(<DemoVoicePanel agentHandle="nobody" agentName="Nobody" />)
    expect(screen.queryAllByRole('button')).toEqual([])
    expect(screen.getByTestId('demo-voice-label')).toBeTruthy()
  })
})

describe("the demo's voice panel takes its own room (usability finding 7) @SC-1961", () => {
  it('is opaque, so the thread under the floating block never shows through it', () => {
    render(<DemoVoicePanel agentHandle="writer" agentName="Writer" />)
    expect(screen.getByTestId('demo-voice').className).toContain('bg-surface-1')
  })

  it("says the call's state as its own first row: waiting for a line, then speaking", () => {
    const { rerender } = render(<DemoVoicePanel agentHandle="writer" agentName="Writer" />)
    const panel = screen.getByTestId('demo-voice')
    expect(panel.firstElementChild?.getAttribute('data-testid')).toBe('voice-line')
    expect(screen.getByTestId('voice-line').textContent).toBe('Writer is waiting for your line')
    h.phase = 'speaking'
    rerender(<DemoVoicePanel agentHandle="writer" agentName="Writer" />)
    expect(screen.getByTestId('voice-line').textContent).toBe('Writer is speaking')
  })

  it('leaves thinking to the run line above it', () => {
    render(<DemoVoicePanel agentHandle="writer" agentName="Writer" running />)
    expect(screen.queryByTestId('voice-line')).toBeNull()
  })
})
