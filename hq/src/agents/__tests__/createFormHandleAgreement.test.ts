import { describe, it, expect } from 'vitest'
import { isValidAgentHandle, AGENT_HANDLE_MAX_LENGTH } from '../agentHandle'
// The create-agent form lives in the ui package, which has no test harness of
// its own; this keeps its sanitizer in step with the server rule.
import { sanitizeHandle } from '@agenthix/ui/agents'

describe('create-agent form handle sanitizer agrees with the server rule', () => {
  it.each([
    ['Research Bot', 'research_bot'],
    ['--leading-hyphens', 'leading-hyphens'],
    ['__leading_underscores', 'leading_underscores'],
    ['-_-a', 'a'],
    ['UPPER-case_9', 'upper-case_9'],
    ['x'.repeat(200), 'x'.repeat(AGENT_HANDLE_MAX_LENGTH)],
  ])('%j becomes %j, which the server accepts', (input, expected) => {
    const out = sanitizeHandle(input.replace(/\s+/g, '_'))
    expect(out).toBe(expected)
    expect(isValidAgentHandle(out)).toBe(true)
  })

  it('yields an empty string, never an invalid handle, when nothing usable remains', () => {
    expect(sanitizeHandle('---___')).toBe('')
  })
})
