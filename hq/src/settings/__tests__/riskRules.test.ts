import { describe, it, expect } from 'vitest'
import { parseRiskRules, MAX_RISK_RULES } from '../riskRules'

describe('parseRiskRules', () => {
  it('accepts a list of rules with known levels', () => {
    const rules = [{ pattern: 'rm -rf', riskLevel: 'HIGH' }, { pattern: 'curl', riskLevel: 'MEDIUM' }]
    expect(parseRiskRules(rules)).toEqual({ rules })
    expect(parseRiskRules([])).toEqual({ rules: [] })
  })

  it.each([
    ['a string', 'rm -rf'],
    ['an object', { pattern: 'x', riskLevel: 'HIGH' }],
    ['null', null],
  ])('refuses %s in place of a list', (_name, value) => {
    expect(parseRiskRules(value)).toHaveProperty('error')
  })

  it.each([
    ['a rule that is not an object', ['curl']],
    ['no pattern', [{ riskLevel: 'HIGH' }]],
    ['an empty pattern, which would match every command', [{ pattern: '', riskLevel: 'HIGH' }]],
    ['a pattern that is not text', [{ pattern: 3, riskLevel: 'HIGH' }]],
    ['an unknown level', [{ pattern: 'x', riskLevel: 'severe' }]],
    ['a level in the wrong case', [{ pattern: 'x', riskLevel: 'high' }]],
    ['a missing level', [{ pattern: 'x' }]],
    ['too long a pattern', [{ pattern: 'x'.repeat(501), riskLevel: 'LOW' }]],
  ])('refuses %s', (_name, value) => {
    expect(parseRiskRules(value)).toHaveProperty('error')
  })

  it('refuses more rules than the limit and names the rule at fault', () => {
    expect(parseRiskRules(Array.from({ length: MAX_RISK_RULES + 1 }, () => ({ pattern: 'x', riskLevel: 'LOW' })))).toHaveProperty('error')
    expect(parseRiskRules([{ pattern: 'x', riskLevel: 'LOW' }, { pattern: '', riskLevel: 'LOW' }])).toEqual({ error: 'Rule 2 has no pattern.' })
  })
})
