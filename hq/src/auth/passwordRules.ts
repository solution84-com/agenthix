export const PASSWORD_MIN_LENGTH = 8

/** What is wrong with a password chosen at sign-up or in a password change, or null when it may be used. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
  return null
}
