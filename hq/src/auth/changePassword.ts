import { HttpError, prisma } from 'wasp/server'
import type { ChangePasswordApi } from 'wasp/server/api'
import { hashPassword, verifyPassword } from 'wasp/auth/password'
import { passwordProblem } from './passwordRules'
import { guessPassword } from './passwordGuess'

export { WRONG_PASSWORD_LIMIT } from './passwordGuess'

export type ChangePasswordInput = {
  userId: string
  /** The session the change is made from: it stays signed in, every other one ends. */
  sessionId: string
  currentPassword: string
  newPassword: string
  newPasswordAgain: string
}

export type ChangePasswordResult = { ok: true; signedOut: number }

/**
 * A person changes their own password (Settings › Sign-in). The password is
 * Wasp's username identity's, hashed by Wasp's own `hashPassword` and checked
 * with its `verifyPassword`, as its login does. Every other session and every
 * unspent phone pairing code ends with it; connections for outside tools are
 * tokens of their own and stay.
 */
export async function changePassword(input: ChangePasswordInput): Promise<ChangePasswordResult> {
  const { userId, sessionId, currentPassword, newPassword, newPasswordAgain } = input
  if (!currentPassword || !newPassword || !newPasswordAgain) {
    throw new HttpError(400, 'Enter your current password, then the new one twice')
  }
  if (newPassword !== newPasswordAgain) throw new HttpError(400, 'The new password and its repeat are not the same')
  const problem = passwordProblem(newPassword)
  if (problem) throw new HttpError(400, problem)

  const auth = await prisma.auth.findUnique({
    where: { userId },
    select: { id: true, identities: { where: { providerName: 'username' } } },
  })
  const identity = auth?.identities[0]
  if (!auth || !identity) throw new HttpError(400, 'This account has no password to change')

  const providerData = JSON.parse(identity.providerData) as Record<string, unknown> & { hashedPassword?: string }
  const hashed = providerData.hashedPassword
  const guess = await guessPassword(userId, async () =>
    typeof hashed === 'string' && verifyPassword(hashed, currentPassword).then(() => true, () => false))
  if (guess === 'too-many') throw new HttpError(429, 'Too many wrong passwords. Try again in 15 minutes.')
  if (guess === 'wrong') throw new HttpError(400, 'Your current password is not right')

  const hashedPassword = await hashPassword(newPassword)
  const [, signedOut] = await prisma.$transaction([
    prisma.authIdentity.update({
      where: { providerName_providerUserId: { providerName: identity.providerName, providerUserId: identity.providerUserId } },
      data: { providerData: JSON.stringify({ ...providerData, hashedPassword }) },
    }),
    prisma.session.deleteMany({ where: { userId: auth.id, id: { not: sessionId } } }),
    prisma.mobileAuthToken.deleteMany({ where: { userId } }),
  ])
  return { ok: true, signedOut: signedOut.count }
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')

export const changePasswordHandler: ChangePasswordApi = async (req, res, context) => {
  // Wasp's auth middleware sets the session the request came with on the request; its types do not say so.
  const sessionId = (req as typeof req & { sessionId?: string | null }).sessionId
  if (!context.user || !sessionId) return res.status(401).json({ error: 'Sign in to change your password' })
  const body = (req.body ?? {}) as Record<string, unknown>
  try {
    const result = await changePassword({
      userId: context.user.id,
      sessionId,
      currentPassword: text(body.currentPassword),
      newPassword: text(body.newPassword),
      newPasswordAgain: text(body.newPasswordAgain),
    })
    return res.json(result)
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.statusCode).json({ error: err.message })
    throw err
  }
}
