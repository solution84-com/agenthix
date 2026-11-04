/**
 * A failed run's reason in plain words, for the conversation (every screen
 * reviewed, *A failed run*): "The site lost its connection to the model." The
 * raw error stays on the run, behind Details. Errors the site already writes
 * for a person to read (a closed conversation, a missing credential named by
 * hq) are kept as they are; anything not recognised reads as a plain failure.
 */

type Rule = { test: RegExp; reason: string }

/** An HTTP status in the provider's phrasing ("answered 529", "status code 401", "HTTP 503") or leading the text ("429 rate_limit_error"), never a bare number in other text. */
const status = (codes: string) => `(?:^\\s*|(?:answered|status(?: code)?|http)[: ]+)(?:${codes})\\b`

const RULES: Rule[] = [
  { test: /context ?overflow|prompt is too long|context (length|window)|maximum context|too many tokens/i, reason: "The agent's memory of this conversation was full." },
  { test: new RegExp(`${status('529')}|overloaded`, 'i'), reason: 'The model provider was overloaded.' },
  { test: new RegExp(`${status('429')}|rate[- ]?limit`, 'i'), reason: "The model provider's rate limit was reached." },
  { test: new RegExp(`refused the credential|${status('401|403')}|unauthori[sz]ed|invalid (?:x-)?api[ -]?key|authentication[_ ]error|invalid authentication`, 'i'), reason: 'The model provider refused the credential.' },
  { test: /still failing after|asked to wait/i, reason: 'The model provider kept failing, so the site stopped trying.' },
  { test: new RegExp(`${status('5\\d\\d')}|internal server error|bad gateway|service unavailable`, 'i'), reason: 'The model provider had an error.' },
  { test: /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|fetch failed|network (?:error|is unreachable|request failed)|connection (was )?(lost|closed|reset)|stream (was )?(lost|ended)|lost its stream|server stopped/i, reason: 'The site lost its connection to the model.' },
  { test: /process ended during the turn|exited with code|process (exited|crashed|was killed)|SIGKILL|out of memory/i, reason: "The agent's process stopped unexpectedly." },
  { test: /did not accept the message|is not a model|not a model OpenCode can run/i, reason: "The agent's runtime could not take the message." },
  { test: /no capability|capability (is )?(invalid|expired)|jwt/i, reason: 'The run could not prove what it was allowed to do.' },
  { test: /package_unavailable|package content/i, reason: "The agent's setup could not be loaded on the site." },
]

/** Errors written to be read by a person as they are (`sessionExistenceCheck.ts`, hq's credential problems). */
const ALREADY_PLAIN: RegExp[] = [
  /^This conversation was closed because/,
  /^The agent no longer has this conversation's context/,
  /^No (model )?credential/i,
  /^A Claude subscription can only be used/,
  /^The run was given an? \S+ credential for/,
  /^The OpenAI-compatible endpoint has no address/,
]

export const UNKNOWN_FAILURE_REASON = 'Something went wrong while the agent was working.'

export function plainFailureReason(raw: string | null | undefined): string {
  const text = (raw ?? '').trim()
  if (!text) return UNKNOWN_FAILURE_REASON
  if (ALREADY_PLAIN.some(p => p.test(text))) return text
  return RULES.find(r => r.test.test(text))?.reason ?? UNKNOWN_FAILURE_REASON
}
