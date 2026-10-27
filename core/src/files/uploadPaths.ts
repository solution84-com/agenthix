/**
 * The files hq keeps itself — task attachments and pictures — named by the path they are kept under in hq's upload
 * folder. hq signs an `upload` ticket only for such a path, and hq's relay serves only such a path, from that folder
 * mounted read-only. Each is matched on its decoded form.
 */
export const UPLOAD_PATH_PATTERNS: readonly RegExp[] = [
  /^\/files\/task\/[^/]+\/[^/]+\/.+$/,
  /^\/agents\/[^/]+\/images\/[^/]+$/,
  /^\/people\/[^/]+\/images\/[^/]+$/,
  /^\/org\/images\/[^/]+$/,
  /^\/teams\/[^/]+\/images\/[^/]+$/,
]

/** Shown on the sign-in page, so one may be opened without a session. */
const SHOWN_BEFORE_SIGN_IN = /^\/org\/images\/[^/]+$/

const MAX_UPLOAD_PATH = 4096

// The patterns' `[^/]+` and `.+` would admit `..`: a path must also step nowhere but down, and hold no character a
// file system or a header could read as anything else.
function staysInItsFolder(path: string): boolean {
  if (path.length > MAX_UPLOAD_PATH || /[\0-\x1f\x7f\\]/.test(path)) return false
  return path.slice(1).split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')
}

export const isUploadPath = (path: string): boolean =>
  typeof path === 'string' && staysInItsFolder(path) && UPLOAD_PATH_PATTERNS.some(p => p.test(path))

export const mayBeShownBeforeSignIn = (path: string): boolean => isUploadPath(path) && SHOWN_BEFORE_SIGN_IN.test(path)
