/**
 * An Execution Site asks for hq's Agenthix Cloud access token, scoped to AI, for a container's calls through Cloud's
 * gateway (`POST HQ_CLOUD_AI_TOKEN_PATH`, with the site's machine credential). hq's private key never leaves hq; only
 * the short-lived token would.
 *
 * Until hq's calls to Cloud's AI exist (part 6: built when the hosted side is ready), the answer is a refusal:
 * `not_connected` while hq has no Cloud connection, otherwise `not_available`.
 */
import type { CloudAiTokenApi } from 'wasp/server/api'
import type { CloudAiTokenRefusal } from '@agenthix/core'
import { cloudConnection } from '../cloud'
import { authenticateSite } from './registrationService'
import { requireFeature } from '../features/requireFeature'

export type CloudAiTokenDeps = { connected: () => Promise<boolean> }

const realDeps: CloudAiTokenDeps = {
  connected: async () => !!(await cloudConnection()?.clientId().catch(() => null)),
}

export async function cloudAiTokenAnswer(deps: CloudAiTokenDeps = realDeps): Promise<CloudAiTokenRefusal> {
  return { error: (await deps.connected()) ? 'not_available' : 'not_connected' }
}

export const cloudAiTokenHandler: CloudAiTokenApi = async (req, res) => {
  await requireFeature('cloud')
  const auth = req.headers.authorization
  const siteId = req.headers['x-site-id']
  if (!auth?.startsWith('Bearer ') || typeof siteId !== 'string' || !siteId) {
    res.status(401).json({ error: 'unauthorized' }); return
  }
  if (!(await authenticateSite(siteId, auth.slice('Bearer '.length)))) {
    res.status(401).json({ error: 'unauthorized' }); return
  }
  res.status(409).json(await cloudAiTokenAnswer())
}
