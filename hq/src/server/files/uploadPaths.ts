/**
 * The paths uploaded files are served at — the only paths the files origin answers, and the only ones HQ makes
 * links to. Each is matched on its stored (decoded) form.
 */
const UPLOAD_PATHS = [
  /^\/files\/task\/[^/]+\/[^/]+\/.+$/,
  /^\/agents\/[^/]+\/images\/[^/]+$/,
  /^\/people\/[^/]+\/images\/[^/]+$/,
  /^\/org\/images\/[^/]+$/,
  /^\/teams\/[^/]+\/images\/[^/]+$/,
]

/** Shown on the sign-in page, so a link to one may be made without a session; the files origin decides which. */
const SHOWN_BEFORE_SIGN_IN = /^\/org\/images\/[^/]+$/

export const isUploadPath = (path: string) => UPLOAD_PATHS.some(p => p.test(path))

export const mayBeShownBeforeSignIn = (path: string) => SHOWN_BEFORE_SIGN_IN.test(path)
