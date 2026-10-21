// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const useQuery = vi.hoisted(() => vi.fn())
const getToolCallOutput = vi.hoisted(() => vi.fn())
vi.mock('wasp/client/operations', () => ({ useQuery, getToolCallLog: 'getToolCallLog', getToolCallOutput }))

import { ToolCalls } from '../ToolCalls'

const call = (id: string, over: Record<string, unknown> = {}) => ({
  id, runId: 'r1', toolName: 'bash', toolInput: { command: `cmd ${id}` }, toolUseId: `toolu_${id}`, riskLevel: 'LOW', blocked: false, blockReason: null,
  createdAt: '2026-10-09T09:06:00Z', ...over,
})
const calls = [
  call('a'), call('b', { riskLevel: 'HIGH' }), call('c', { riskLevel: 'FLAGGED' }),
  call('d', { blocked: true, blockReason: 'set to Never for this agent', toolUseId: null }),
]
beforeEach(() => {
  vi.clearAllMocks()
  useQuery.mockReturnValue({ data: calls, isLoading: false })
})

describe('a run\'s tool calls @SC-530 @SC-652', () => {
  it('lists every call with its risk label, and narrows to High and Flagged', () => {
    render(<ToolCalls runId="r1" sessionId="s1" />)
    expect(screen.getByText('bash cmd a')).toBeTruthy()
    expect(screen.getByText('High')).toBeTruthy()
    expect(screen.getByText('Flagged')).toBeTruthy()
    expect(screen.getByText('Blocked — set to Never for this agent')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'High and Flagged' }))
    expect(screen.queryByText('bash cmd a')).toBeNull()
    expect(screen.getByText('bash cmd b')).toBeTruthy()
    expect(screen.getByText('bash cmd c')).toBeTruthy()
  })

  it('opens a call to its input and the output found by its own id, a long one cut to its first lines', async () => {
    const output = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n')
    getToolCallOutput.mockResolvedValue({ recorded: true, output, truncated: false })
    render(<ToolCalls runId="r1" sessionId="s1" />)
    fireEvent.click(screen.getByText('bash cmd a'))

    await waitFor(() => expect(screen.getByText('Show all 30 lines')).toBeTruthy())
    expect(getToolCallOutput).toHaveBeenCalledWith({ runId: 'r1', sessionId: 's1', toolUseId: 'toolu_a' })
    expect(screen.queryByText(/line 29/)).toBeNull()
    fireEvent.click(screen.getByText('Show all 30 lines'))
    expect(screen.getByText(/line 29/)).toBeTruthy()
  })

  it('says who approved a call that asked first', () => {
    render(<ToolCalls runId="r1" sessionId="s1" given={{ tools: [], bashPatterns: ['cmd a'], by: 'you', at: '2026-10-09T09:10:00Z' }} />)
    expect(screen.getByText(/Asked first — approved by you/)).toBeTruthy()
    expect(screen.getAllByText(/Asked first/)).toHaveLength(1)
  })

  it('says "Output not recorded" for a call from before ids were kept, without asking', () => {
    render(<ToolCalls runId="r1" sessionId="s1" />)
    fireEvent.click(screen.getByText('bash cmd d'))
    expect(screen.getByText('Output not recorded')).toBeTruthy()
    expect(getToolCallOutput).not.toHaveBeenCalled()
  })
})
