/** The coordinator's voice hooks: a report turn taking its turn lowers the hand; a turn answering a person does not. */
import { afterEach, describe, expect, it } from 'vitest'
import type { ClaimedTurn } from '../../coordinator/claim'
import { openVoiceSession, resetVoiceSessions, turnVoice } from '../registry'

const deps = {
  async *synthesize() { /* nothing is said */ },
  toHolder: () => {},
  speechFailed: () => {},
  now: () => 0,
}

function claimed(trigger: ClaimedTurn['trigger'], actingUserId: string | null): ClaimedTurn {
  return { turnId: `t-${trigger}`, trigger, actingUserId, conversation: { id: 'conv-1' } as ClaimedTurn['conversation'], inputIds: [], queuedAt: new Date(), startedAt: new Date() }
}

afterEach(() => resetVoiceSessions())

describe("voice's hooks in the coordinator", () => {
  it('hold cards only while someone holds voice and has not invited the hand', () => {
    expect(turnVoice.holdsCards('conv-1')).toBe(false)
    const session = openVoiceSession('conv-1', 'u1', 's1', deps)
    expect(turnVoice.holdsCards('conv-1')).toBe(true)
    turnVoice.raiseHand('conv-1', { updateId: 'card-1', critical: false })
    session.hand.invite('card-1')
    expect(turnVoice.holdsCards('conv-1')).toBe(false)
  })

  it('a report turn beginning takes the invited hand; the holder\'s own message does not', () => {
    const session = openVoiceSession('conv-1', 'u1', 's1', deps)
    turnVoice.raiseHand('conv-1', { updateId: 'card-1', critical: false })
    session.hand.invite('card-1')
    expect(turnVoice.begin(claimed('MESSAGE', 'u1'))).not.toBeNull()
    expect(turnVoice.holdsCards('conv-1')).toBe(false)
    expect(turnVoice.begin(claimed('REPORT', null))).not.toBeNull()
    expect(turnVoice.holdsCards('conv-1')).toBe(true)
  })
})

describe('a raised hand nobody answers, in the coordinator', () => {
  it('lets the cards be claimed, and its report turn is not spoken', () => {
    let fire: (() => void) | null = null
    let scheduled = 0
    openVoiceSession('conv-1', 'u1', 's1', {
      ...deps, handExpired: () => { scheduled++ }, handTimer: { after: (_ms, fn) => { fire = fn; return () => {} } },
    })
    turnVoice.raiseHand('conv-1', { updateId: 'card-1', critical: false })
    expect(turnVoice.holdsCards('conv-1')).toBe(true)
    fire!()
    expect(scheduled).toBe(1)
    expect(turnVoice.holdsCards('conv-1')).toBe(false)
    expect(turnVoice.begin(claimed('REPORT', null))).toBeNull()
    expect(turnVoice.holdsCards('conv-1')).toBe(true)
  })
})
