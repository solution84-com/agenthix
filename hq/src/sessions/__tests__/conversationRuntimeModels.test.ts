/**
 * adr-0078 in the chat: the model options follow the runtime a conversation
 * started on, not the runtime its agent has been switched to since.
 */
import { describe, it, expect } from 'vitest'
import { conversationRuntime } from '@agenthix/ui/sessions'

describe('conversationRuntime', () => {
  it('keeps the conversation runtime after the agent is switched to opencode', () => {
    expect(conversationRuntime({ runtime: 'claude-sdk', agent: { runtime: 'opencode' } })).toBe('claude-sdk')
  })

  it('keeps opencode after the agent is switched back to claude', () => {
    expect(conversationRuntime({ runtime: 'opencode', agent: { runtime: 'claude-sdk' } })).toBe('opencode')
  })

  it('falls back to the agent runtime when none is recorded', () => {
    expect(conversationRuntime({ runtime: null, agent: { runtime: 'opencode' } })).toBe('opencode')
    expect(conversationRuntime({ agent: { runtime: 'opencode' } })).toBe('opencode')
  })

  it('defaults to claude-sdk with neither', () => {
    expect(conversationRuntime(null)).toBe('claude-sdk')
    expect(conversationRuntime({ agent: null })).toBe('claude-sdk')
  })
})
