import type { ApiHandler } from '../http/apiHandler'
import { verifyHqToken } from './verifyHqToken'
import { Logger } from '../utils/logger'

const logger = new Logger('identity')

/** What jose raises when hq's key set could not be had, as against a token it refused. */
const KEY_SET_UNAVAILABLE_CODES = new Set(['ERR_JWKS_TIMEOUT', 'ERR_JWKS_INVALID', 'ERR_JOSE_GENERIC'])

function keySetUnavailable(err: { code?: unknown; name?: string }): boolean {
  return KEY_SET_UNAVAILABLE_CODES.has(String(err.code)) || err.name === 'TypeError' || err.name === 'AbortError'
}

/** Proves §2 end-to-end: presents an hq-issued token, gets back the verified identity. */
export const whoamiHandler: ApiHandler = async (req, res) => {
  const auth = req.headers.authorization
  const token = auth?.startsWith('Bearer ') ? auth.substring(7) : null
  if (!token) return res.status(401).json({ error: 'Missing Bearer token' })
  try {
    const payload = await verifyHqToken(token)
    res.json({ userId: payload.sub, tokenType: payload.tokenType, role: payload.role ?? null })
  } catch (err: any) {
    if (/No HQ connection/.test(err.message)) {
      logger.warn(`whoami could not resolve hq: ${err.message}`)
      return res.status(503).json({ error: 'HQ not configured' })
    }
    if (keySetUnavailable(err)) {
      logger.warn(`whoami could not fetch hq's keys: ${err.message}`)
      return res.status(503).json({ error: "HQ's keys could not be fetched" })
    }
    res.status(401).json({ error: 'Invalid token' })
  }
}
