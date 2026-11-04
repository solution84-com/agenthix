import type { RiskRule, ToolCallRiskLevel } from '@agenthix/core'

const LEVELS: readonly ToolCallRiskLevel[] = ['SAFE', 'LOW', 'MEDIUM', 'HIGH', 'FLAGGED']

export const MAX_RISK_RULES = 200
export const MAX_RISK_PATTERN_LENGTH = 500

/**
 * The rules a site rates a shell command with, checked before they are stored: a list of rules, each with a
 * non-empty pattern (an empty one would match every command) and one of the known levels. Returns the rules as stored,
 * or the reason they are refused.
 */
export function parseRiskRules(value: unknown): { rules: RiskRule[] } | { error: string } {
  if (!Array.isArray(value)) return { error: 'The risk rules must be a list.' }
  if (value.length > MAX_RISK_RULES) return { error: `There can be at most ${MAX_RISK_RULES} risk rules.` }
  const rules: RiskRule[] = []
  for (const [i, entry] of value.entries()) {
    const n = i + 1
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return { error: `Rule ${n} is not a rule.` }
    const { pattern, riskLevel } = entry as Record<string, unknown>
    if (typeof pattern !== 'string' || pattern === '') return { error: `Rule ${n} has no pattern.` }
    if (pattern.length > MAX_RISK_PATTERN_LENGTH) return { error: `Rule ${n}'s pattern is longer than ${MAX_RISK_PATTERN_LENGTH} characters.` }
    if (typeof riskLevel !== 'string' || !(LEVELS as readonly string[]).includes(riskLevel)) {
      return { error: `Rule ${n} has no known risk level (${LEVELS.join(', ')}).` }
    }
    rules.push({ pattern, riskLevel: riskLevel as ToolCallRiskLevel })
  }
  return { rules }
}
