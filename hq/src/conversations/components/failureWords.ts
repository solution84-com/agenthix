/**
 * A failure's reason, worded for whoever reads it. The words come from the server as what happened, naming the
 * provider, then (where only an organisation admin can fix it) sentences that begin "An organisation admin". An admin
 * is taken to Providers; a member is told an admin has been told.
 */
export type FailureWords = {
  /** What happened, in the server's words, without the sentences addressed to an admin. */
  what: string
  /** Whether an organisation admin is the one who can fix it. */
  adminFixes: boolean
  /** Whether the admin sentences name the Providers page, so an admin gets the way there. */
  providers: boolean
}

const ADMIN = /^An organisation admin\b/

export function failureWords(reason: string): FailureWords {
  const sentences = reason.split(/(?<=[.!?])\s+/).filter(Boolean)
  const admin = sentences.filter((s) => ADMIN.test(s))
  return {
    what: sentences.filter((s) => !ADMIN.test(s)).join(' '),
    adminFixes: admin.length > 0,
    providers: admin.some((s) => /Providers/.test(s)),
  }
}

/** The line a member reads where an admin would be given the way to fix it. */
export const ADMIN_TOLD = 'An administrator has been told.'
