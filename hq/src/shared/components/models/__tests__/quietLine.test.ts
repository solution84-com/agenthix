import { describe, expect, it } from 'vitest'
import { makerInitials, shortModelName } from '../modelPickerLogic'

describe('the quiet line’s short names @SC-953', () => {
  it('drops the maker from the label', () => {
    expect(shortModelName('DeepSeek V4.1 Flash', 'DeepSeek')).toBe('V4.1 Flash')
    expect(shortModelName('Claude Sonnet 5', 'Anthropic')).toBe('Sonnet 5')
    expect(shortModelName('OpenAI GPT-5.2', 'OpenAI')).toBe('GPT-5.2')
  })
  it('keeps a label that does not start with the maker, and one that is only the maker', () => {
    expect(shortModelName('GPT-5.2', 'OpenAI')).toBe('GPT-5.2')
    expect(shortModelName('Mistral', 'Mistral')).toBe('Mistral')
  })
  it('marks a maker with its initials, or its first two letters', () => {
    expect(makerInitials('DeepSeek')).toBe('DS')
    expect(makerInitials('Anthropic')).toBe('AN')
    expect(makerInitials('OpenAI')).toBe('OA')
    expect(makerInitials('Mistral')).toBe('MI')
    expect(makerInitials('')).toBe('')
  })
})
