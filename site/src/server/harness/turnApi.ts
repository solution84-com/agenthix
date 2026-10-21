/**
 * POST /api/v1/harness/turn — Agenthix's OpenCode plugin asks for an OpenCode
 * session's current turn (core's openCodePlugin.ts): the conversation's id for
 * the process tag, the conversation's platform token for the gate call, and
 * the headers each model request carries: the turn's relay token, which the
 * site's model relay exchanges for the provider's key (spec §6).
 *
 * Authenticated here, like the other endpoints an agent container reaches:
 * checked against the key the site gave that container's server at start
 * (openCodeTurns.ts). The key only ever opens its own server's sessions, and
 * between turns the answer is `turn: null`. Nothing about a refusal is
 * explained beyond its status.
 */
import type { ApiHandler } from '../http/apiHandler'
import { parseHarnessTurnRequest, type HarnessTurnResponse } from '@agenthix/core'
import { containerForServerKey, resolveHarnessTurn } from '../../agents/runtime/opencode/openCodeTurns'

export const harnessTurnHandler: ApiHandler = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  const header = req.headers.authorization
  const key = header?.startsWith('Bearer ') ? header.slice(7) : ''
  if (!containerForServerKey(key)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const request = parseHarnessTurnRequest(req.body)
  if (!request) {
    res.status(400).json({ error: 'sessionId required' })
    return
  }
  const body: HarnessTurnResponse = { turn: resolveHarnessTurn(key, request.sessionId) }
  res.json(body)
}
