/** The demo guard's lists for the routes that are not Wasp operations (live demo spec, the demo guard). */

/**
 * The writes (anything but `GET`, `HEAD`, `OPTIONS`) that answer in demo mode outside `/operations/`: signing out, the
 * demo's own entry, and what the demo's site needs. Every other write is
 * refused: signing in and signing up, invitations, password changes and resets, Cloud sign-in and its AI token, a
 * phone's pairing, the MCP server, a site or host service leaving, the move check, restoring.
 */
export const DEMO_WRITES: ReadonlySet<string> = new Set([
  '/auth/logout',
  '/api/demo/enter',
  '/api/v1/capabilities/renew',
  '/api/v1/data',
  '/api/v1/usage/report',
])

/** Reads refused all the same: the GitHub App's registration, and Cloud sign-in's link for a signed-in person. */
export const REFUSED_READS: ReadonlySet<string> = new Set([
  '/api/v1/github/app-manifest-new',
  '/api/v1/github/app-manifest-callback',
  '/api/auth/cloud/link',
])
