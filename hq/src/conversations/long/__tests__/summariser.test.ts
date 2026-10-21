/**
 * The summariser's call (long conversations spec, Compaction in segments): one call on the talking model over the
 * turns' own prefix, with a breakpoint at its end, answering the brief and the full summary together.
 */
import { describe, it, expect } from 'vitest'
import { MockLanguageModelV3 } from 'ai/test'
import { createModelAdapter } from '../../model'
import { anthropicAccess, usageOf } from '../../model/testSupport'
import { BRIEF_MAX_CHARS, parseSummariserAnswer, SUMMARISER_INSTRUCTION, SummariserAnswerError, summariserRequest } from '../summariser'
import type { LeadMessage, PromptPart } from '../../contract'

const system: PromptPart[] = [{ text: 'You are Kernel', cacheAfter: true }]
const folded: LeadMessage[] = [{ role: 'user', content: 'Plan the launch' }, { role: 'assistant', content: 'Friday it is.' }]

describe('summariserRequest @SC-979', () => {
  it('sends the same system parts and the folded messages as they were, the breakpoint at their end, the instruction behind it', () => {
    const request = summariserRequest({ access: anthropicAccess, system, folded, conversationId: 'conv-1', signal: new AbortController().signal })
    expect(request.system).toBe(system)
    expect(request.messages.slice(0, 2)).toEqual(folded)
    expect(request.messages[2]).toEqual({ role: 'user', content: SUMMARISER_INSTRUCTION })
    expect(request.cacheAfterMessage).toBe(1)
    expect(request.cacheKey).toBe('conv-1')
  })
})

describe('parseSummariserAnswer @SC-979', () => {
  it('reads the brief and the summary from one JSON answer, fenced or not', () => {
    expect(parseSummariserAnswer('```json\n{"brief": "Launch planned", "summary": "Friday, after QA."}\n```'))
      .toEqual({ brief: 'Launch planned', summary: 'Friday, after QA.' })
  })

  it('holds the brief to its budget on one line', () => {
    const { brief } = parseSummariserAnswer(JSON.stringify({ brief: `a\n${'word '.repeat(200)}`, summary: 's' }))
    expect(brief.length).toBeLessThanOrEqual(BRIEF_MAX_CHARS)
    expect(brief).not.toContain('\n')
  })

  it('refuses an answer without both parts', () => {
    expect(() => parseSummariserAnswer('Sure, here is a summary.')).toThrow(SummariserAnswerError)
    expect(() => parseSummariserAnswer('{"brief": "only"}')).toThrow(SummariserAnswerError)
  })
})

describe('through the model adapter @SC-979', () => {
  it('is one complete call whose answer parses', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: {
        content: [{ type: 'text', text: '{"brief":"Launch planned","summary":"Friday, after QA."}' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: usageOf({ total: 40, noCache: 10, cacheRead: 30 }, 12),
        warnings: [],
      },
    })
    const adapter = createModelAdapter({ languageModel: () => model })
    const answer = await adapter.complete(summariserRequest({ access: anthropicAccess, system, folded, conversationId: 'conv-1', signal: new AbortController().signal }))
    expect(parseSummariserAnswer(answer.text)).toEqual({ brief: 'Launch planned', summary: 'Friday, after QA.' })
    expect(model.doGenerateCalls).toHaveLength(1)
    expect(answer.usage.cacheReadTokens).toBe(30)
  })
})
