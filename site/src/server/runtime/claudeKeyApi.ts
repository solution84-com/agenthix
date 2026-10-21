/**
 * POST /api/v1/harness/claude-key — what a `claude` process sends as its API
 * key: its relay token (claudeKeyTickets.ts), answered once for the ticket
 * the site put in the process's environment. Called by Claude Code's
 * `apiKeyHelper`, which prints what it is given as the key; so the answer is
 * the token alone, as text. Never the provider's key.
 */
import type { ApiHandler } from '../http/apiHandler'
import { redeemClaudeKeyTicket } from './claudeKeyTickets'

export const claudeKeyHandler: ApiHandler = (req, res) => {
  const auth = req.headers.authorization ?? ''
  const key = auth.startsWith('Bearer ') ? redeemClaudeKeyTicket(auth.slice('Bearer '.length)) : null
  res.set('Cache-Control', 'no-store')
  if (!key) {
    res.status(401).type('text/plain').send('Unauthorized\n')
    return
  }
  res.status(200).type('text/plain').send(`${key}\n`)
}
