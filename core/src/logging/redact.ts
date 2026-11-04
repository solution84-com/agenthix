/**
 * Secrets out of a log line, before it is written (adr-0106). Applied to the
 * message, to every string in a line's fields, and by key name to the fields
 * themselves, so a token is gone from the file, from standard output and from
 * anything later read out of either.
 *
 * Two kinds of rule. **Shapes**: the credentials this codebase issues or
 * carries have recognisable forms — a model provider's `sk-…` key or
 * subscription login, a GitHub token, a site's machine
 * credential, a connection token, a JWT, a private key, the userinfo of a URL —
 * and each is removed wherever it appears. **Names**: a value written as
 * `password=…`, `"apiKey": "…"`, `authorization: …` or `SECRETS_MASTER_KEY=…`
 * is removed whatever it looks like.
 *
 * Over-removal is the accepted failure: a line that loses a harmless word next
 * to `token:` costs less than one that keeps a key.
 */
import { MACHINE_CREDENTIAL_PREFIX } from '../protocol/siteRegistration.js'
import { CONSOLE_CREDENTIAL_PREFIX, MACHINE_RELAY_CREDENTIAL_PREFIX } from '../host/relay.js'

export const REDACTED = '[redacted]'

/** The credentials hq mints in one form (`prefix_8hex_48hex`): a site's, a host service's link and the Fleet Console's link. */
const SITE_TOKEN = new RegExp(`\\b(?:${MACHINE_CREDENTIAL_PREFIX}|${MACHINE_RELAY_CREDENTIAL_PREFIX}|${CONSOLE_CREDENTIAL_PREFIX})_[A-Za-z0-9_-]{12,}`, 'g')

/** A name whose value is a secret: ends in one of these words (`apiKey`, `HQ_DB_PASSWORD`, `x-access-token`). */
const SECRET_WORD = '(?:password|passwd|passphrase|secret|token|api[_-]?key|apikey|private[_-]?key|access[_-]?key|master[_-]?key|signing[_-]?key|credentials?|authorization|cookie|set-cookie)'

const SHAPES: [RegExp, string][] = [
  // A private key, whole.
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, REDACTED],
  // The userinfo of a URL: https://x-access-token:ghs_…@github.com, postgres://user:pass@host.
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@'"]+@/gi, `$1${REDACTED}@`],
  // An Authorization header's scheme and value.
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{6,}/gi, `$1 ${REDACTED}`],
  // A JWT: a run's capability, an OAuth access token.
  [/\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/g, REDACTED],
  // Model providers: Anthropic keys and subscription logins (sk-ant-api…, sk-ant-oat…, sk-ant-ort…), OpenAI, OpenRouter.
  [/\bsk-[A-Za-z0-9_-]{8,}/g, REDACTED],
  // GitHub tokens of every kind.
  [/\b(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,})/g, REDACTED],
  // A site's machine credential.
  [SITE_TOKEN, REDACTED],
  // A connection token (hq's connections).
  [/\bahx_conn_[A-Za-z0-9_-]{12,}/g, REDACTED],
  // Google API keys, Slack tokens, AWS access key ids.
  [/\bAIza[0-9A-Za-z_-]{30,}/g, REDACTED],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, REDACTED],
  [/\bAKIA[0-9A-Z]{16}\b/g, REDACTED],
]

// name, then `=` or `:`, then a value: quoted whole (a quote inside may be escaped, and a value already escaped once,
// as `\"value\"`, ends at its escaped quote), or up to a separator. The name may be quoted the same way.
const NAMED = new RegExp(
  `((\\\\*["']?)\\b[\\w.-]*${SECRET_WORD}\\2\\s*[:=]\\s*)(?:\\\\"(?:(?!\\\\")[\\s\\S])*\\\\"|"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|[^\\s"',;&}\\]]+)`,
  'gi',
)

// A cookie or authorization header runs to the end of the line: `Cookie: a=1; session=…`, `Authorization: Digest username=…, response=…`.
const HEADER = /(\b(?:set-cookie|cookie|proxy-authorization|authorization)[ \t]*:[ \t]*)(?!["'\\])[^\r\n]+/gi

/** Every secret this module knows the shape or the name of, removed from one piece of text. */
export function redactText(text: string): string {
  let out = text
  for (const [pattern, replacement] of SHAPES) out = out.replace(pattern, replacement)
  return out.replace(HEADER, `$1${REDACTED}`).replace(NAMED, `$1${REDACTED}`)
}

const SECRET_KEY = new RegExp(`${SECRET_WORD}$`, 'i')

/** Whether a field of this name holds a secret (`apiKey`, `refresh_token`, `headers.authorization`); `tokens` counts do not. */
export function isSecretKey(key: string): boolean {
  return SECRET_KEY.test(key)
}
