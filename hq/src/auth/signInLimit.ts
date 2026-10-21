/**
 * Sign-in attempts limited (getting-in spec, Signing in): 10 wrong passwords in
 * 15 minutes from one address make it wait 15 minutes, as invitation codes
 * already do. Wasp's own login route checks the password and answers 401 before
 * any hook of ours runs, so this sits in front of it as middleware: refused
 * while the address is over its budget, and each 401 it answers counted. A
 * right password never counts, and neither does someone who has left (403).
 */
import type { NextFunction, Request, Response } from 'express'
import { consumeRateLimit, isRateLimited } from '../server/rateLimit'
import { Logger } from '../server/utils/logger'

const logger = new Logger('SignIn')

export const SIGN_IN_LIMIT = 10
const RULE = { max: SIGN_IN_LIMIT, windowMs: 15 * 60 * 1000 }
const LOGIN_PATH = '/auth/username/login'

export const signInLimitKey = (ip: string) => `sign-in:${ip}`

export const TOO_MANY_SIGN_INS = 'Too many wrong passwords from here. Try again in 15 minutes.'

export function isSignInRequest(req: Pick<Request, 'method' | 'originalUrl'>): boolean {
  return req.method === 'POST' && req.originalUrl.split('?')[0].replace(/\/+$/, '') === LOGIN_PATH
}

export function signInLimit(req: Request, res: Response, next: NextFunction): void {
  if (!isSignInRequest(req)) return next()
  const key = signInLimitKey(req.ip ?? 'unknown')
  isRateLimited(key, RULE).then(
    (limited) => {
      if (limited) {
        res.status(429).json({ message: TOO_MANY_SIGN_INS })
        return
      }
      res.on('finish', () => {
        if (res.statusCode === 401) consumeRateLimit(key, RULE).catch(err => logger.error('sign-in limit not counted', err))
      })
      next()
    },
    next,
  )
}
