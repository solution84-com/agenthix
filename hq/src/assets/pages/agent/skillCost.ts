/**
 * What an agent's skill listing costs every request (spec part 5 *Cost*, R9). Client-safe and pure.
 *
 * The figure comes from the unit's measurement of a first request on both runtimes: the listing is one entry per
 * skill, `name: description` on Claude Code (about 117 bytes a skill) and an XML entry with the skill's file
 * location on OpenCode (about 307 bytes a skill). The larger form is used, so the estimate errs high: each skill is
 * its name and description plus a fixed entry of 190 bytes, at four bytes a token. Tokens are an estimate within
 * about a quarter, since no provider's own tokenizer could be run offline.
 */
export const WARN_SKILLS = 20
export const WARN_TOKENS = 4000
const ENTRY_BYTES = 190
const BYTES_PER_TOKEN = 4

export type Listed = { name: string; description: string }

const bytes = (text: string) => new TextEncoder().encode(text).length

export function skillTokens(skill: Listed): number {
  return Math.ceil((ENTRY_BYTES + bytes(skill.name) + bytes(skill.description)) / BYTES_PER_TOKEN)
}

export type ListingCost = { skills: number; tokens: number }

export function listingCost(skills: readonly Listed[]): ListingCost {
  return { skills: skills.length, tokens: skills.reduce((sum, s) => sum + skillTokens(s), 0) }
}

/** Above about 20 skills or 4,000 tokens, agents choose less well and every request costs more. */
export const overBudget = (cost: ListingCost): boolean => cost.skills > WARN_SKILLS || cost.tokens > WARN_TOKENS

/** "about 1,900": rounded to the nearest hundred above a thousand, since the figure is an estimate. */
export function approxTokens(tokens: number): string {
  const rounded = tokens >= 1000 ? Math.round(tokens / 100) * 100 : Math.round(tokens / 10) * 10
  return `about ${rounded.toLocaleString('en-US')}`
}

export function costLine(cost: ListingCost): string {
  return `${cost.skills} ${cost.skills === 1 ? 'skill' : 'skills'} · ${approxTokens(cost.tokens)} tokens per request`
}

export function costWarning(agent: string, cost: ListingCost, mayRemove: boolean): string | null {
  if (!overBudget(cost)) return null
  const advice = mayRemove ? ` Remove from ${agent} the ones it doesn't need.` : ' Ask an administrator to remove the ones it doesn\'t need.'
  return `Long list. ${agent} sees ${cost.skills} skills, ${approxTokens(cost.tokens)} tokens on every request. Above about ${WARN_SKILLS} skills or ${WARN_TOKENS.toLocaleString('en-US')} tokens, agents choose less well and every request costs more.${advice}`
}
