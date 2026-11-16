/**
 * The lead's register in voice (conversational experience spec, Voice › The lead's register): the instructions
 * hold the rules for a listening person and for shown parts; the turn block says when the person is listening,
 * and that what they said came through speech to text; a reply spoken over is read with where it was cut.
 */
import { describe, expect, it } from 'vitest'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'
import { INTERRUPTED_HERE, leadMessages, withTurnBlock } from '../../coordinator/context'
import { leadBaseInstructions } from '../../lead/instructions'

function m(seq: number, role: 'PERSON' | 'AGENT', text: string, extra: Partial<ConversationMessageView> = {}): ConversationMessageView {
  return {
    id: `m${seq}`, seq, clientMessageId: null, role, authorId: null, agentId: null, kind: 'TEXT', body: { text }, spoken: false,
    interrupted: false, operationId: null, turnId: 't', queueState: null, createdAt: '', ...extra,
  } as ConversationMessageView
}

describe('the instructions @SC-996', () => {
  const text = leadBaseInstructions({ agentName: 'Kernel', agentRole: null, placeLabel: 'their own space' })
  it('say how to talk to a listening person only in a turn the person hears', () => {
    const heard = (withTurnBlock([{ role: 'user', content: 'hi' }], [m(1, 'PERSON', 'hi', { spoken: true, turnId: null })], { trigger: 'MESSAGE', inputIds: ['m1'] }, true)[0] as { content: string }).content
    for (const said of [/While the person is listening/, /no headings, lists, tables, code or markup/, /numbers, dates, times and names in words/, /result as one sentence, then offer the detail/, /Approving: deploy to/]) {
      expect(heard).toMatch(said)
      expect(text).not.toMatch(said)
    }
  })
  it('say how to show what must be seen', () => {
    expect(text).toContain(':::shown <a short title>')
  })
})

describe('the turn block @SC-996', () => {
  const history = [m(1, 'PERSON', 'what about the build', { spoken: true, turnId: null })]
  const messages = [{ role: 'user' as const, content: 'what about the build' }]

  it('says the person is listening, and that they spoke', () => {
    const out = withTurnBlock(messages, history, { trigger: 'MESSAGE', inputIds: ['m1'] }, true)
    expect(out).toHaveLength(1)
    expect((out[0] as { content: string }).content).toMatch(/^what about the build\n\nThe person is listening, not reading/)
    expect((out[0] as { content: string }).content).toContain('speech to text may have misheard')
  })

  it('says when the person trailed off mid-thought, and only then', () => {
    const block = (trailedOff: boolean) =>
      (withTurnBlock(messages, history, { trigger: 'MESSAGE', inputIds: ['m1'] }, true, trailedOff)[0] as { content: string }).content
    expect(block(true)).toContain('they may not have finished')
    expect(block(false)).not.toContain('they may not have finished')
  })

  it('says when the person went on after a prompt to, so their message is their whole thought', () => {
    const out = withTurnBlock(messages, history, { trigger: 'MESSAGE', inputIds: ['m1'] }, true, false, 'Mm? Go on.')
    expect((out[0] as { content: string }).content).toContain('you said "Mm? Go on.", and they went on')
  })

  it('says nothing of voice when nobody listens', () => {
    expect(withTurnBlock(messages, history, { trigger: 'MESSAGE', inputIds: ['m1'] }, false)).toBe(messages)
  })

  it('goes after a report turn\'s block when the person is listening', () => {
    const out = withTurnBlock([], [], { trigger: 'REPORT', inputIds: [] }, true)
    const content = (out[0] as { content: string }).content
    expect(content.indexOf('Your work in the background')).toBeLessThan(content.indexOf('The person is listening'))
    expect(content).not.toContain('misheard')
  })
})

describe('a reply spoken over @SC-997', () => {
  it('is read with where it was cut', () => {
    const history = [m(1, 'PERSON', 'hi'), m(2, 'AGENT', 'First point.', { interrupted: true }), m(3, 'PERSON', 'wait', { turnId: null })]
    const { messages } = leadMessages(history, ['m3'])
    expect(messages[1]).toEqual({ role: 'assistant', content: `First point.\n\n${INTERRUPTED_HERE}` })
  })
})
