import { describe, expect, it } from 'vitest'
import { answerFactsOf } from '../answerFacts'

const turn = {
  model: 'deepseek/deepseek-flash', startedAt: new Date(0), endedAt: new Date(26_400),
  inputTokens: 3_000, outputTokens: 312, cacheReadTokens: 1_200, cacheWriteTokens: 10,
}

describe('what an answer used', () => {
  it('names the model, the turn\'s time and the tokens it read and wrote, as recorded', () => {
    expect(answerFactsOf(turn, 'DeepSeek Flash')).toEqual({ model: 'DeepSeek Flash', ms: 26_400, tokensRead: 4_210, tokensWritten: 312 })
  })

  it('falls back to the model\'s own id, and has no time for a turn that has not ended', () => {
    expect(answerFactsOf({ ...turn, endedAt: null }, null)).toMatchObject({ model: 'deepseek-flash', ms: null })
    expect(answerFactsOf({ ...turn, model: null }, null).model).toBeNull()
  })
})
