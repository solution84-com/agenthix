import { describe, expect, it } from 'vitest'
import { formatDuration, formatSeconds, parameterAccepts, parameterRule, whenWords } from '../workflowWords'

describe('parameterRule', () => {
  it('says a character class and its length in words', () => {
    expect(parameterRule({ name: 'branch', kind: 'pattern', pattern: '[A-Za-z0-9._/-]{1,100}' })).toBe('Letters, digits, . _ / - · up to 100')
  })
  it('says a fixed list and free text', () => {
    expect(parameterRule({ name: 'env', kind: 'values', values: ['staging', 'prod'] })).toBe('One of: staging, prod')
    expect(parameterRule({ name: 'm', kind: 'text' })).toContain('Any text')
  })
  it('shows a pattern it cannot spell out as it is', () => {
    expect(parameterRule({ name: 'x', kind: 'pattern', pattern: 'v\\d+\\.\\d+' })).toBe('Must match v\\d+\\.\\d+')
  })
})

describe('parameterAccepts', () => {
  const branch = { name: 'branch', kind: 'pattern' as const, pattern: '[A-Za-z0-9._/-]{1,100}' }
  it('matches the whole value', () => {
    expect(parameterAccepts(branch, 'feature/region')).toBe(true)
    expect(parameterAccepts(branch, 'feature region')).toBe(false)
    expect(parameterAccepts(branch, '')).toBe(false)
  })
  it('checks a fixed list', () => {
    expect(parameterAccepts({ name: 'e', kind: 'values', values: ['a'] }, 'b')).toBe(false)
  })
})

describe('durations and dates', () => {
  it('formats', () => {
    expect(formatDuration(41_000)).toBe('41 s')
    expect(formatDuration(72_000)).toBe('1 min 12 s')
    expect(formatSeconds(600)).toBe('10 min')
  })
  it('names yesterday', () => {
    expect(whenWords(new Date('2026-10-23T09:00:00'), new Date('2026-10-24T10:00:00'))).toBe('yesterday')
  })
})

describe('inConversationWords', () => {
  it('names the conversation a version was proposed in, and nothing when it may not be read', async () => {
    const { inConversationWords } = await import('../workflowWords')
    expect(inConversationWords({ title: 'Ship the shop' })).toBe(' in "Ship the shop"')
    expect(inConversationWords({ title: null })).toBe(' in "a conversation"')
    expect(inConversationWords(null)).toBe('')
  })
})
