import type { ApiHandler } from '../http/apiHandler'
import { verifyHqToken } from './verifyHqToken'
import { Logger } from '../utils/logger'

const logger = new Logger('identity')

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
    res.status(401).json({ error: 'Invalid token' })
  }
}
