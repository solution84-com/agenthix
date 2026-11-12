import type { EnterDemoApi } from 'wasp/server/api'
import { demoOn } from '../demoMode'
import { enterDemo } from './enterDemo'

/** `POST /api/demo/enter`: there only in demo mode; anywhere else it answers as a route that does not exist. */
export const enterDemoHandler: EnterDemoApi = async (req, res) => {
  if (!demoOn()) return res.status(404).json({ error: 'Not found' })
  const entered = await enterDemo(req.ip ?? 'unknown')
  if (!entered.ok) return res.status(entered.status).json({ error: entered.error, reason: entered.reason })
  return res.json({ sessionId: entered.sessionId })
}
