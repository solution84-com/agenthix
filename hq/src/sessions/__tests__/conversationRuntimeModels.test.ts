/**
 * adr-0078 in the chat: the model options follow the runtime a conversation started on.
 */
import { describe, it, expect } from 'vitest'
import { conversationRuntime } from '@agenthix/ui/sessions'

describe('conversationRuntime', () => {
  it('is the runtime the conversation started on', () => {
    expect(conversationRuntime({ runtime: 'claude-sdk' })).toBe('claude-sdk')
    expect(conversationRuntime({ runtime: 'opencode' })).toBe('opencode')
  })

  it('defaults to claude-sdk when none is recorded', () => {
    expect(conversationRuntime(null)).toBe('claude-sdk')
    expect(conversationRuntime({ runtime: null })).toBe('claude-sdk')
    expect(conversationRuntime({})).toBe('claude-sdk')
  })
})
