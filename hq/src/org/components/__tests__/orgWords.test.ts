import { describe, it, expect } from 'vitest'
import { modelAccessText } from '../SettingsSection'
import { tokenCount } from '../TodaySection'
import { teamMix, worksIn } from '../teams/teamWords'

describe('model access is told by provider, never a runtime', () => {
  it.each([
    [[], 'None set'],
    [['Anthropic'], 'Anthropic'],
    [['Anthropic', 'OpenRouter'], 'Anthropic +1 more'],
    [['Anthropic', 'OpenRouter', 'OpenAI'], 'Anthropic +2 more'],
  ])('%j reads %s', (providers, text) => {
    expect(modelAccessText(providers)).toBe(text)
  })
})

describe('numbers and counts on the Organisation page', () => {
  it('shortens tokens', () => {
    expect([tokenCount(0), tokenCount(950), tokenCount(12_400), tokenCount(18_200_000)]).toEqual(['0', '950', '12k', '18.2M'])
  })

  it('tells a team’s mix and where it works', () => {
    expect(teamMix(2, 1)).toBe('2 people · 1 agent')
    expect(teamMix(1, 2)).toBe('1 person · 2 agents')
    expect(worksIn(0)).toBe('Not in a project yet')
    expect(worksIn(1)).toBe('Works in 1 project')
  })
})
