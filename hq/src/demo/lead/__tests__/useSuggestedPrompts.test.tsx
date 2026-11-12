// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'

const h = vi.hoisted(() => ({ info: undefined as unknown }))
vi.mock('wasp/client/operations', () => ({
  getDemoInfo: 'getDemoInfo',
  useQuery: (op: string) => (op === 'getDemoInfo' ? { data: h.info } : { data: undefined }),
}))

import { useSuggestedPrompts } from '../useSuggestedPrompts'
import { SuggestedPrompts } from '../SuggestedPrompts'

const on = { on: true, nextResetAt: null, agents: { writer: { suggestedPrompts: ['What can you do?', 'Start a task'], voiceLines: [] } } }

afterEach(cleanup)

describe('the demo suggestions an agent offers @SC-1959', () => {
  it('are the scripted ones in demo mode', () => {
    h.info = on
    expect(renderHook(() => useSuggestedPrompts('writer')).result.current).toEqual(['What can you do?', 'Start a task'])
    expect(renderHook(() => useSuggestedPrompts('kernel')).result.current).toEqual([])
  })

  it('are none with the demo off, or before the setting is known @SC-1979', () => {
    h.info = { on: false, nextResetAt: null, agents: {} }
    expect(renderHook(() => useSuggestedPrompts('writer')).result.current).toEqual([])
    h.info = undefined
    expect(renderHook(() => useSuggestedPrompts('writer')).result.current).toEqual([])
  })
})

describe('the suggestions under the message box @SC-1959', () => {
  it('are one button each, and a tap gives its words', () => {
    const onPick = vi.fn()
    render(<SuggestedPrompts prompts={['What can you do?', 'Start a task']} onPick={onPick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start a task' }))
    expect(onPick).toHaveBeenCalledWith('Start a task')
  })

  it('draw nothing when there are none', () => {
    render(<SuggestedPrompts prompts={[]} onPick={() => undefined} />)
    expect(screen.queryByTestId('suggested-prompts')).toBeNull()
  })
})
