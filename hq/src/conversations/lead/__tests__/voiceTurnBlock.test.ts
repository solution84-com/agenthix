/**
 * The voice turn block (voice that stays in the conversation, spec §1; Decision 7): while the `voiceBridge` flag is on,
 * the voice rules leave the base instructions and go with a turn the person hears, the whole accepted text only on a
 * spoken message; each person's Adaptive voice off leaves out the opening sentence. While it is off, everything is as
 * it was.
 */
import { describe, expect, it } from 'vitest'
import type { FeatureFlag } from '@agenthix/core'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'
import { contextFrom, withTurnBlock, type ContextParts } from '../../coordinator/context'
import { leadBaseInstructions } from '../instructions'
import { voiceTurnBlock } from '../voiceTurnBlock'

const OPENING = /begin it with one short sentence saying you will look into what they asked/
const JUDGING = /First judge whether they have finished their thought/
const HOLD = /Not finished: call the keep_listening tool with a short reason, and write nothing else\./
const OLD_RULES = /While the person is listening|:::encouragement/

function m(seq: number, text: string, extra: Partial<ConversationMessageView> = {}): ConversationMessageView {
  return {
    id: `m${seq}`, seq, clientMessageId: null, role: 'PERSON', authorId: 'u1', agentId: null, kind: 'TEXT', body: { text }, spoken: false,
    interrupted: false, operationId: null, turnId: null, queueState: null, createdAt: '', ...extra,
  } as ConversationMessageView
}

const base = (featuresOn: readonly FeatureFlag[] = []) => leadBaseInstructions({ agentName: 'Kernel', agentRole: null, placeLabel: 'their own space', featuresOn })

function context(input: { flag: boolean; spoken: boolean; listening?: ContextParts['listening']; trigger?: 'MESSAGE' | 'REPORT' }) {
  const featuresOn: FeatureFlag[] = input.flag ? ['voiceBridge'] : []
  return contextFrom({
    instructions: { agentName: 'Kernel', agentRole: null, placeLabel: 'their own space', agentInstructions: null, orgInstructions: null, featuresOn },
    segments: [], awaiting: new Set(), turn: { trigger: input.trigger ?? 'MESSAGE', inputIds: ['m1'] }, memory: null, places: null,
    history: [m(1, 'so I was thinking we could', { spoken: input.spoken })],
    listening: input.listening === undefined ? { trailedOff: false, wentOnAfter: null } : input.listening,
  })
}
const turnText = (c: ReturnType<typeof contextFrom>) => (c.messages.at(-1) as { content: string }).content

describe("the lead's base instructions", () => {
  it('carry no voice text, flag on or off: a typed turn pays for none of it', () => {
    for (const featuresOn of [[], ['voiceBridge']] as FeatureFlag[][]) {
      expect(base(featuresOn)).not.toMatch(OLD_RULES)
      expect(base(featuresOn)).not.toMatch(/keep_listening|voice conversation/)
    }
    expect(base(['voiceBridge'])).toBe(base())
  })

  it('send the voice rules and the encouragement rule with a heard turn while the flag is off', () => {
    const heard = turnText(context({ flag: false, spoken: true }))
    expect(heard).toMatch(OLD_RULES)
    expect(heard).toContain('Reply with the line :::encouragement')
  })
})

describe('the voice turn block @SC-1830 @SC-1831', () => {
  it('on a spoken message is the accepted text: how to speak, how to judge, the hold, and the opening sentence', () => {
    const block = voiceTurnBlock({ spoken: true, adaptiveVoice: true, trailedOff: false, wentOn: false })
    expect(block.startsWith('You are in a voice conversation with the user: they speak to you and hear your replies, so write for the ear.')).toBe(true)
    expect(block).toMatch(JUDGING)
    expect(block).toMatch(HOLD)
    expect(block).toMatch(OPENING)
    expect(block.endsWith('If you can answer straight away, just answer.')).toBe(true)
  })

  it("leaves out only the opening sentence when the person's Adaptive voice is off; the hold stays", () => {
    const block = voiceTurnBlock({ spoken: true, adaptiveVoice: false, trailedOff: false, wentOn: false })
    expect(block).not.toMatch(OPENING)
    expect(block).not.toMatch(/answer straight away/)
    expect(block).toMatch(HOLD)
    expect(block.endsWith('- Finished: reply in plain spoken text.')).toBe(true)
  })

  it('on a turn heard but not spoken says only how to speak', () => {
    const block = voiceTurnBlock({ spoken: false, adaptiveVoice: true, trailedOff: true, wentOn: true })
    expect(block).toMatch(/How to speak:/)
    expect(block).not.toMatch(JUDGING)
    expect(block).not.toMatch(/keep_listening|paused|long pause/)
  })

  it('says when they trailed off, and when they went on after a pause, without quoting the agent', () => {
    const block = voiceTurnBlock({ spoken: true, adaptiveVoice: true, trailedOff: true, wentOn: true })
    expect(block).toContain('they may not have finished')
    expect(block).toContain('They paused mid-thought earlier and went on')
    expect(block).not.toMatch(/you said/i)
    expect(voiceTurnBlock({ spoken: true, adaptiveVoice: true, trailedOff: false, wentOn: false })).not.toMatch(/may not have finished|went on:/)
  })
})

describe("a turn's context while the flag is on @SC-1830 @SC-1831", () => {
  it('appends the whole block to a spoken message, uncached, and marks the turn as one the model may hold', () => {
    const c = context({ flag: true, spoken: true })
    expect(turnText(c)).toMatch(/^so I was thinking we could\n\nYou are in a voice conversation/)
    expect(turnText(c)).toMatch(HOLD)
    expect(c.system.map(p => p.text).join('')).not.toMatch(/voice conversation|keep_listening/)
    expect(c.spokenMessage).toBe(true)
  })

  it('appends only how to speak to a typed message the holder hears, and the model may not hold it', () => {
    const c = context({ flag: true, spoken: false })
    expect(turnText(c)).toMatch(/How to speak:/)
    expect(turnText(c)).not.toMatch(JUDGING)
    expect(c.spokenMessage).toBeUndefined()
  })

  it('reads the Adaptive voice and the hold the person went on after', () => {
    const c = context({ flag: true, spoken: true, listening: { trailedOff: true, wentOnAfter: null, wentOnAfterHold: true, adaptiveVoice: false } })
    expect(turnText(c)).not.toMatch(OPENING)
    expect(turnText(c)).toContain('They paused mid-thought earlier and went on')
    expect(turnText(c)).toContain('they may not have finished')
  })

  it('adds nothing of voice when no one is listening', () => {
    const c = context({ flag: true, spoken: true, listening: null })
    expect(turnText(c)).toBe('so I was thinking we could')
    expect(c.spokenMessage).toBeUndefined()
  })
})

describe("a turn's context while the flag is off", () => {
  it('is the turn block of before, and no turn may be held', () => {
    const c = context({ flag: false, spoken: true })
    const before = withTurnBlock([{ role: 'user', content: 'so I was thinking we could' }], [m(1, 'so I was thinking we could', { spoken: true })], { trigger: 'MESSAGE', inputIds: ['m1'] }, true)
    expect(c.messages).toEqual(before)
    expect(turnText(c)).toMatch(/^so I was thinking we could\n\nThe person is listening, not reading/)
    expect(c.spokenMessage).toBeUndefined()
  })
})
