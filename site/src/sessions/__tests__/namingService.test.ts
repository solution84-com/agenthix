import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateSessionTitle } from '../namingService'

describe('NamingService @SC-140', () => {
  const db = {
    AgentSession: {
      update: vi.fn().mockResolvedValue({}),
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('generates a title from the first 6 words', async () => {
    const message = 'The quick brown fox jumps over the lazy dog'
    const title = await generateSessionTitle('session-123', message, db)

    expect(title).toBe('The quick brown fox jumps over...')
    expect(db.AgentSession.update).toHaveBeenCalledWith({
      where: { id: 'session-123' },
      data: { title: 'The quick brown fox jumps over...' },
    })
  })

  it('does not add ellipsis if message is within 6 words', async () => {
    const message = 'Hello world how are you'
    const title = await generateSessionTitle('session-123', message, db)

    expect(title).toBe('Hello world how are you')
    expect(db.AgentSession.update).toHaveBeenCalledWith({
      where: { id: 'session-123' },
      data: { title: 'Hello world how are you' },
    })
  })

  it('handles empty messages gracefully', async () => {
    const title = await generateSessionTitle('session-123', '   ', db)
    expect(title).toBeNull()
  })
})

// SC-070 — "A new conversation auto-names itself from the first user message."
// Scenario-coverage citation for the auto-naming behaviour the action triggers
// on the first message of a "New Conversation". The mechanics are the same as
// the @SC-140 suite above; this describe carries the SC-070 tag and asserts the
// from-first-message naming and the persisted write.
describe('generateSessionTitle auto-names from first message @SC-070', () => {
  const db = {
    AgentSession: {
      update: vi.fn().mockResolvedValue({}),
    },
  }

  beforeEach(() => vi.clearAllMocks())

  it('derives the session title from the first user message and persists it', async () => {
    const title = await generateSessionTitle('sess-1', 'Build a billing dashboard', db)

    expect(title).toBe('Build a billing dashboard')
    expect(db.AgentSession.update).toHaveBeenCalledWith({
      where: { id: 'sess-1' },
      data: { title: 'Build a billing dashboard' },
    })
  })

  it('truncates a long first message to six words plus an ellipsis', async () => {
    const title = await generateSessionTitle(
      'sess-2',
      'one two three four five six seven eight nine',
      db,
    )
    expect(title).toBe('one two three four five six...')
  })
})
