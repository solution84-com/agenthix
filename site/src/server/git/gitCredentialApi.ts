/**
 * POST /api/v1/git/credential — site's half (plan 5d-2 task 8). Called by the
 * agent container's git credential helper; authenticated here.
 *
 * Moved from hq/src/server/git/gitCredentialApi.ts + gitCredentialService.ts,
 * with the static-key/admin branch DROPPED (same escalation rule as
 * mcp/handler.ts: only the container-facing capability path moves). The
 * resolution itself now spans both machines — genuinely, not by choice:
 *
 * - The repo attachment lives in SITE's own database (plan 5c) — looked up
 *   directly here via workspaceRows, no network hop.
 * - The agent's project assignment (ProjectAgent) and
 *   the GitHub App installation token mint (the App's private key, org-level
 *   state) are hq-only — no site-side equivalent exists or should exist for a
 *   secret this sensitive. Forwarded via callHqData to a NEW hq registry op,
 *   `resolve_git_credential` (`hq/src/server/controlplane/runtimeOps.ts`):
 *   git credential resolution cannot be ported to site without either this
 *   forward or duplicating GitHub App secret handling on site, and the
 *   latter is a materially bigger change.
 */
import type { ApiHandler } from '../http/apiHandler'
import type { CapabilityClaims } from '@agenthix/core'
import { resolveRunToken } from '../runtime/runTokens'
import { verifyHqToken } from '../identity/verifyHqToken'
import { findRepoAttachmentByUrl } from '../storage/workspaceRows'
import { callHqData, HqDataError } from '../hq/dataClient'
import { Logger } from '../utils/logger'

const logger = new Logger('git-credential')

export const gitCredentialHandler: ApiHandler = async (req, res) => {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const token = authHeader.substring(7)

  const holder = resolveRunToken(token)
  if (!holder) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  let claims: CapabilityClaims
  try {
    claims = (await verifyHqToken(holder.jwt, 'capability')) as unknown as CapabilityClaims
  } catch (e) {
    logger.warn('capability verification failed', e instanceof Error ? e.name : 'unknown')
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const { owner, repo } = (req.body ?? {}) as { owner?: string; repo?: string }
  if (!owner || !repo) {
    res.status(400).json({ error: 'owner + repo required' })
    return
  }

  const name = repo.replace(/\.git$/, '')
  const repoUrl = `https://github.com/${owner}/${name}`
  const attachment = await findRepoAttachmentByUrl({ repoUrl })
  if (!attachment) {
    res.status(403).json({ error: `No repo attachment for ${owner}/${repo}.` })
    return
  }

  try {
    const credential = await callHqData(
      'resolve_git_credential',
      {
        agentId: claims.agentId,
        ownerType: attachment.ownerType,
        ownerId: attachment.ownerId,
        workspaceId: attachment.workspaceId,
        owner,
        repo: name,
      },
      holder.jwt,
    )
    res.json(credential)
  } catch (e) {
    if (e instanceof HqDataError) {
      // status 0 means the call never reached hq at all (unregistered, or
      // dataClient.ts's own unreachable/timeout paths) — a gateway failure,
      // not a permission decision. `e.status || 403` used to collapse it into
      // 403 (0 is falsy), telling the caller "forbidden" for a condition that
      // has nothing to do with authorization (spec review).
      res.status(e.status === 0 ? 502 : e.status).json({ error: e.message })
      return
    }
    res.status(403).json({ error: e instanceof Error ? e.message : String(e) })
  }
}
