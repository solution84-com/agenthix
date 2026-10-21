/** *Summarise now* on screen (walkthrough finding 36): Summarising… until its marker arrives, or why it failed. */
import { describe, expect, it } from 'vitest'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'
import { IDLE, RUNNING, summariseOnEvent, summariseOnMessage } from '../summariseState'

const marker = { kind: 'SUMMARISED', role: 'PLATFORM' } as ConversationMessageView
const words = { kind: 'TEXT', role: 'AGENT' } as ConversationMessageView

describe('Summarise now on screen @SC-983', () => {
  it('shows Summarising… from when it starts until its marker arrives', () => {
    expect(summariseOnEvent(IDLE, { conversationId: 'c1', state: 'started' })).toEqual(RUNNING)
    expect(summariseOnMessage(RUNNING, words)).toEqual(RUNNING)
    expect(summariseOnMessage(RUNNING, marker)).toEqual(IDLE)
  })

  it('ends when it ended without a marker of its own', () => {
    expect(summariseOnEvent(RUNNING, { conversationId: 'c1', state: 'ended' })).toEqual(IDLE)
  })

  it('says why it failed, in the server\'s words or in general ones', () => {
    expect(summariseOnEvent(RUNNING, { conversationId: 'c1', state: 'failed', reason: 'Try again in a moment.' }))
      .toEqual({ state: 'failed', reason: 'Try again in a moment.' })
    expect(summariseOnEvent(RUNNING, { conversationId: 'c1', state: 'failed' }))
      .toEqual({ state: 'failed', reason: 'The conversation could not be summarised.' })
  })

  it('keeps a failure on screen when a marker from elsewhere arrives', () => {
    const failed = { state: 'failed' as const, reason: 'x' }
    expect(summariseOnMessage(failed, marker)).toBe(failed)
  })
})
