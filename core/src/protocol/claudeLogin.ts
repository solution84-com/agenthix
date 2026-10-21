/**
 * Signing in with a Claude subscription, on a site.
 *
 * A person adds a subscription by signing in on Anthropic's own page. hq asks
 * a connected site to run the login in a throwaway container, shows the person
 * the sign-in link, and takes back the short code they paste. The three
 * methods below are the whole of that exchange; the registry of throwaway
 * containers lives on the site (`site/src/server/login/claudeLogin.ts`) and
 * hq's memory of who started which login lives on hq.
 *
 * ## Why the site, and why one process
 *
 * A login needs a machine with Docker and the agent image, and no person's
 * storage. The sign-in proof lives only in the memory of the process that
 * printed the link, so the code must reach that same process — `start` keeps
 * it open, and `finish` writes the code to it.
 *
 * ## What travels, and what must not be kept
 *
 * `finish` returns the credentials file's text, the one thing on this wire
 * that is a secret. hq encrypts it the moment it arrives. Neither side may log
 * the link's query string, the code, or any part of the file, and a failure
 * carries a fixed message that cannot include the code.
 */
export const CLAUDE_LOGIN_METHODS = {
  /** Control channel: start a login and return the sign-in link. */
  start: 'claudeLogin.start',
  /** Control channel: give the login the pasted code and return the credential. */
  finish: 'claudeLogin.finish',
  /** Control channel: abandon a login and remove its container. Idempotent. */
  cancel: 'claudeLogin.cancel',
} as const

export type ClaudeLoginMethod = (typeof CLAUDE_LOGIN_METHODS)[keyof typeof CLAUDE_LOGIN_METHODS]

export type ClaudeLoginStartParams = Record<string, never>

export type ClaudeLoginStartResult = {
  /** The site's handle for this login; hq quotes it back in `finish` and `cancel`. */
  loginId: string
  /** The sign-in link on Anthropic's own page, for the person to open. */
  url: string
}

export type ClaudeLoginFinishParams = {
  loginId: string
  /** The short code the person pasted. */
  code: string
}

export type ClaudeLoginFinishResult = {
  /** The whole `.credentials.json` text. A secret: hq encrypts it on arrival. */
  oauthJson: string
}

export type ClaudeLoginCancelParams = { loginId: string }

export type ClaudeLoginCancelResult = { cancelled: true }
