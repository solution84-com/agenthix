/**
 * The lead's context (conversation layer spec, Context): the base instructions first, a cache breakpoint after
 * the instructions; the record as the model reads it, up to the last message the turn answers.
 */
import { describe, it, expect } from 'vitest'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'
import { INTERRUPTED_HERE, leadMessages, systemParts } from '../context'

function m(seq: number, role: 'PERSON' | 'AGENT' | 'PLATFORM', kind: string, body: unknown, extra: Partial<ConversationMessageView> = {}): ConversationMessageView {
  return {
    id: `m${seq}`, seq, clientMessageId: null, role, authorId: null, agentId: null, kind, body, spoken: false,
    interrupted: false, operationId: null, turnId: 't', queueState: null, createdAt: '', ...extra,
  } as ConversationMessageView
}

describe('systemParts @SC-980', () => {
  it('puts the base instructions first and one breakpoint after the last part', () => {
    const parts = systemParts({ agentName: 'Kernel', agentRole: null, placeLabel: 'their own space', agentInstructions: 'Be brief.', orgInstructions: null })
    expect(parts[0]!.text).toMatch(/^You are Kernel/)
    expect(parts[1]).toEqual({ text: '# Your instructions\n\nBe brief.', cacheAfter: true })
    expect(parts.filter(p => p.cacheAfter)).toHaveLength(1)
  })
})

describe('leadMessages @SC-980', () => {
  it('reads what was said in order, joining runs by one side, and stops at the last input', () => {
    const history = [
      m(1, 'PERSON', 'TEXT', { text: 'hi' }),
      m(2, 'AGENT', 'TEXT', { text: 'hello' }),
      m(3, 'PLATFORM', 'NOTICE', { text: 'moved' }),
      m(4, 'PERSON', 'TEXT', { text: 'a' }, { turnId: null }),
      m(5, 'PERSON', 'TEXT', { text: 'b' }, { turnId: null }),
      m(6, 'PERSON', 'TEXT', { text: 'later' }, { turnId: null, queueState: 'WAITING' }),
    ]
    const { messages, cacheAfter } = leadMessages(history, ['m4', 'm5'])
    expect(messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
      { role: 'user', content: 'a\n\nb' },
    ])
    expect(cacheAfter).toBe(1)
  })

  it('keeps a failed reply\'s partial text, a summary as context, and leaves out a cancelled message', () => {
    const history = [
      m(1, 'PLATFORM', 'SUMMARISED', { brief: 'b', summary: 'We planned the launch.' }),
      m(2, 'PERSON', 'TEXT', { text: 'gone' }, { queueState: 'CANCELLED', turnId: null }),
      m(3, 'PERSON', 'TEXT', { text: 'go on' }),
      m(4, 'AGENT', 'FAILED', { reason: 'x', partialText: 'Half' }),
      m(5, 'PERSON', 'TEXT', { text: 'again' }, { turnId: null }),
    ]
    const { messages } = leadMessages(history, ['m5'])
    expect(messages).toEqual([
      { role: 'user', content: 'Summary of the conversation so far:\n\nWe planned the launch.\n\ngo on' },
      { role: 'assistant', content: 'Half' },
      { role: 'user', content: 'again' },
    ])
  })

  it('leaves out a reply withdrawn unheard when the person\'s words joined their message, unless it made something', () => {
    const made = { text: '', thinking: { ms: 1, steps: [{ label: 'Started the build', ms: 1, made: 'started' as const }] } }
    const history = [
      m(1, 'PERSON', 'TEXT', { text: 'what about the build and the tests' }),
      m(2, 'AGENT', 'TEXT', { text: '' }, { interrupted: true, withdrawn: true }),
      m(3, 'AGENT', 'TEXT', made, { interrupted: true, withdrawn: true }),
      m(4, 'AGENT', 'TEXT', { text: 'Both passed.' }),
      m(5, 'PERSON', 'TEXT', { text: 'thanks' }),
    ]
    const { messages } = leadMessages(history, ['m5'])
    expect(messages.map(x => x.role)).toEqual(['user', 'assistant', 'user'])
    const reply = JSON.stringify(messages[1])
    expect(reply).toContain('[Record: started the build]')
    expect(reply).toContain('Both passed.')
    // Only the one that made something is read: one stop marker, not two.
    expect(reply.split(INTERRUPTED_HERE)).toHaveLength(2)
  })

  it('moves the breakpoint back when the input joins the message before it', () => {
    const history = [m(1, 'PERSON', 'TEXT', { text: 'hi' }), m(2, 'PERSON', 'TEXT', { text: 'more' }, { turnId: null })]
    expect(leadMessages(history, ['m2']).cacheAfter).toBeUndefined()
  })

  it("reads a person's answer to a request as theirs, after the request, and leaves out one another turn still has to take", () => {
    const history = [
      m(1, 'PLATFORM', 'APPROVAL_REQUEST', { title: 'Update task', reason: 'to rename it', askedBy: 'Kernel' }, { operationId: 'op-1' }),
      m(2, 'PERSON', 'APPROVAL_ANSWER', { answer: 'decline', note: 'Not now' }, { operationId: 'op-1', turnId: null }),
      m(3, 'PERSON', 'APPROVAL_ANSWER', { answer: 'approve' }, { operationId: 'op-2', turnId: null }),
    ]
    const { messages } = leadMessages(history, ['m2'], new Set(), 'Kernel')
    expect(messages).toHaveLength(1)
    expect(messages[0]!.role).toBe('user')
    const said = (messages[0] as { content: string }).content
    expect(said).toMatch(/\[Your work on "Update task" needs the person's okay to go on, because: to rename it\. They answer it on its card; say nothing about it unless they ask\.\]/)
    expect(said).toMatch(/\[The person answered your request: declined\]\nTheir note: Not now$/)
  })

  it('reads what a reply started or set after its words, even when it wrote some (walkthrough finding 34)', () => {
    const steps = [
      { label: 'Your places', ms: 3 },
      { label: 'Started "List every file" · your space', ms: 5, made: 'started' },
      { label: 'Set "WAL-4 Morning check" to start Sun 18 Oct, 9:00', ms: 5, made: 'set' },
    ]
    const history = [
      m(1, 'PERSON', 'TEXT', { text: 'List my space, and a morning check tomorrow at 9' }),
      m(2, 'AGENT', 'TEXT', { text: "I'm listing your space now.", thinking: { ms: 9, steps } }),
      m(3, 'AGENT', 'FAILED', { reason: 'x', thinking: { ms: 9, steps: steps.slice(1, 2) } }),
      m(4, 'PERSON', 'TEXT', { text: 'thanks' }, { turnId: null }),
    ]
    const { messages } = leadMessages(history, ['m4'])
    expect(messages[1]).toEqual({
      role: 'assistant',
      content: "I'm listing your space now.\n\n[Record: started \"List every file\" · your space]\n[Record: set \"WAL-4 Morning check\" to start Sun 18 Oct, 9:00]\n\n[Record: started \"List every file\" · your space]",
    })
  })
})
