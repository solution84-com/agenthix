import { describe, it, expect } from 'vitest'
import { CONVERSATION_PROCESS_TAG, isTaggableConversationId } from '../processTag.js'

describe('the conversation process tag', () => {
  it('is named SITE_SESSION', () => {
    expect(CONVERSATION_PROCESS_TAG).toBe('SITE_SESSION')
  })

  it('accepts uuids and cuids, and nothing a shell or a pattern would read as syntax', () => {
    expect(isTaggableConversationId('3f2b8c1e-9a4d-4f6e-8b7a-1c2d3e4f5a6b')).toBe(true)
    expect(isTaggableConversationId('cm1q2w3e4r5t6y7u8i9o0p')).toBe(true)
    for (const bad of ['', 'a b', 'a.b', 'a*', '$(x)', 'a\nb', 'x'.repeat(129)]) {
      expect(isTaggableConversationId(bad)).toBe(false)
    }
  })
})
