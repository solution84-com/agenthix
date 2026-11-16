// A breaking commit, in the Conventional Commits form (docs/CONTRIBUTING.md): `type(area)!: what changed`, with a
// `BREAKING CHANGE: <what an installation must do>` footer. Either mark alone makes the commit breaking; the release
// notes need the footer's words.

const BANG = /^[a-z]+(\([^)]*\))?!:/
const FOOTER = /^BREAKING[ -]CHANGE:[ \t]*/m
// A footer runs to the next footer token (`Token: ` or `Token #`) or the end of the message.
const NEXT_FOOTER = /\n(?:[A-Za-z][\w-]*(?:: | #)|BREAKING[ -]CHANGE:)/

export function isMarkedBreaking(message) {
  return BANG.test(message.trim()) || FOOTER.test(message)
}

/** The footer's words, on one line; null when the commit has no `BREAKING CHANGE:` footer. */
export function breakingFooter(message) {
  const at = message.search(FOOTER)
  if (at < 0) return null
  const rest = message.slice(at).replace(FOOTER, '')
  const end = rest.search(NEXT_FOOTER)
  const words = (end < 0 ? rest : rest.slice(0, end)).replace(/\s+/g, ' ').trim()
  return words || null
}

/** `git log --format=%H%x1f%B%x1e` read back into `{ sha, subject, message }`. */
export function parseLog(text) {
  return text.split('\x1e').map((entry) => entry.replace(/^\n/, '')).filter((entry) => entry.includes('\x1f')).map((entry) => {
    const [sha, message] = entry.split('\x1f')
    return { sha: sha.trim(), subject: message.trim().split('\n')[0], message: message.trim() }
  })
}
