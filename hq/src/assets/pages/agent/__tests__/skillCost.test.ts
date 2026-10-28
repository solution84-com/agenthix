import { describe, expect, it } from 'vitest'
import { approxTokens, costLine, costWarning, listingCost, overBudget, skillTokens, WARN_SKILLS, WARN_TOKENS } from '../skillCost'

const skill = (n: number, description = 'Draft articles and copy from briefs, in the brand\'s voice.') => ({ name: `skill-${n}`, description })

describe("an agent's listing cost (R9)", () => {
  it('estimates a skill from its name and description plus a fixed entry, at four bytes a token', () => {
    expect(skillTokens({ name: 'abcd', description: 'efgh' })).toBe(Math.ceil((190 + 8) / 4))
    expect(skillTokens({ name: 'é', description: '' })).toBe(Math.ceil((190 + 2) / 4))
  })

  it('adds the listed skills and counts them', () => {
    const cost = listingCost([skill(1), skill(2)])
    expect(cost.skills).toBe(2)
    expect(cost.tokens).toBe(skillTokens(skill(1)) + skillTokens(skill(2)))
    expect(listingCost([])).toEqual({ skills: 0, tokens: 0 })
  })

  it('warns above about 20 skills or 4,000 tokens, and not at them', () => {
    expect(overBudget({ skills: WARN_SKILLS, tokens: WARN_TOKENS })).toBe(false)
    expect(overBudget({ skills: WARN_SKILLS + 1, tokens: 100 })).toBe(true)
    expect(overBudget({ skills: 3, tokens: WARN_TOKENS + 1 })).toBe(true)
  })

  it('says the warning to an administrator with the way out, and to a member to ask', () => {
    const cost = { skills: 24, tokens: 4600 }
    expect(costWarning('Ada', cost, true)).toContain('Ada sees 24 skills, about 4,600 tokens on every request')
    expect(costWarning('Ada', cost, true)).toContain("Remove from Ada the ones it doesn't need.")
    expect(costWarning('Ada', cost, false)).toContain('Ask an administrator')
    expect(costWarning('Ada', { skills: 11, tokens: 1900 }, true)).toBeNull()
  })

  it('rounds the estimate and words the line', () => {
    expect(approxTokens(1874)).toBe('about 1,900')
    expect(approxTokens(347)).toBe('about 350')
    expect(costLine({ skills: 1, tokens: 120 })).toBe('1 skill · about 120 tokens per request')
  })
})
