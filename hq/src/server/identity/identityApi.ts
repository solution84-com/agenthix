import { type JwksApi, type MintSiteTokenApi, type RenewCapabilityApi } from 'wasp/server/api'
import { prisma } from 'wasp/server'
import { IDENTITY_TOKEN_TTL_SECONDS, parseCapabilityOnBehalfOf, parseCapabilityRunner, parseRunStartedBy, type CapabilityRenewResult } from '@agenthix/core'
import { getPublicJwks } from './signingKeyService'
import { mintIdentityToken, verifyHqToken } from './tokenService'
import { renewCapability } from './capabilityService'
import { authenticateSite } from '../../sites/registrationService'
import { SiteUnreachableError } from '../../storage/workspaceStore'
import { Logger } from '../utils/logger'

const logger = new Logger('Identity')

/** Public JWKS (spec §2) — sites fetch + cache this; kid enables later rotation. */
export const jwksHandler: JwksApi = async (_req, res) => {
  try {
    const jwks = await getPublicJwks()
    res.set('Cache-Control', 'public, max-age=300').json(jwks)
  } catch (err: any) {
    logger.warn('jwksHandler failed', err)
    res.status(503).json({ error: 'Signing key unavailable' })
  }
}

/** Mint an identity token for the logged-in user (spec §2). Wasp session-authenticated. */
export const mintSiteTokenHandler: MintSiteTokenApi = async (req, res, context) => {
  if (!context.user) return res.status(401).json({ error: 'Not authenticated' })
  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userId: context.user.id },
    })
    const org = await prisma.org.findFirst({ orderBy: { createdAt: 'asc' } })
    // An identity token is not a run and has no storage to be placed by.
    // Absent a body-provided siteId it is audienced to hq's own installation
    // id (`SiteConfig.siteId`), which names no Execution Site — no site
    // accepts such a token. A caller that wants one a site accepts names it.
    const siteId = (req.body as { siteId?: string } | undefined)?.siteId
      ?? (await prisma.siteConfig.upsert({ where: { id: 'singleton' }, create: {}, update: {} })).siteId
    if (!siteId) return res.status(400).json({ error: 'No site to mint for' })
    const { token, expiresAt } = await mintIdentityToken({
      userId: context.user.id,
      // No settings row = the least organisation role (5b-1 ledger 25); onboarding writes the real role.
      role: settings?.role ?? 'MEMBER',
      orgId: org?.id ?? null,
      siteId,
    })
    res.json({ token, expiresAt, expiresInSeconds: IDENTITY_TOKEN_TTL_SECONDS })
  } catch (err: any) {
    logger.warn('mintSiteTokenHandler failed', err)
    res.status(503).json({ error: 'Signing key unavailable' })
  }
}

/**
 * §2a renewal (HQ_CAPABILITY_RENEW_PATH, @agenthix/core): present the current,
 * still-valid capability; receive a fresh one with claims re-resolved from
 * live data. Same posture as /api/v1/data (dataApi.ts, plan 5b-2 task 5) —
 * the only future HTTP caller is a site, and the in-process renewal loop
 * (capabilityRenewal.ts, called from AgentEngine.ts) calls renewCapability()
 * directly, never this handler, so re-shaping the contract here does not
 * touch it.
 *
 * Two things layered, same as dataApi: the site's own machine credential
 * (Authorization: Bearer <credential> + X-Site-Id) via authenticateSite, then
 * the capability JWT itself — now carried in the body (CapabilityRenewRequest,
 * @agenthix/core) rather than the bearer header, since the bearer slot is the
 * machine credential's. verifyHqToken pins the audience to the X-Site-Id the
 * caller just proved it is, closing the no-audience gap the original version
 * had (5b-1 ledger item 3).
 *
 * renewCapability re-resolves siteId from live rows (a project's execution
 * site can change between mints), so the audience pin on the OLD capability
 * being presented is not enough on its own — the freshly resolved claims must
 * also match the site that authenticated. Otherwise a stale capability minted
 * for site A, presented by site A, could re-resolve to site B and hand A a
 * capability audienced to B: exactly the cross-site leak the pin exists to
 * stop, just one resolve later. Refused as the same 410 as any other
 * un-renewable capability — from the caller's view this one cannot be renewed
 * HERE, which is true.
 */
export const renewCapabilityHandler: RenewCapabilityApi = async (req, res) => {
  const auth = req.headers.authorization
  const siteId = req.headers['x-site-id']
  if (!auth?.startsWith('Bearer ') || typeof siteId !== 'string' || !siteId) {
    res.status(401).json({ error: 'unauthorized' }); return
  }
  const site = await authenticateSite(siteId, auth.slice('Bearer '.length))
  if (!site) { res.status(401).json({ error: 'unauthorized' }); return }

  const { capability } = (req.body ?? {}) as { capability?: unknown }
  if (typeof capability !== 'string' || !capability) {
    res.status(400).json({ error: 'capability is required' }); return
  }

  let payload
  try {
    payload = await verifyHqToken(capability, 'capability', siteId)
  } catch (e) {
    logger.warn('capability rejected', e instanceof Error ? e.name : 'unknown')
    res.status(401).json({ error: 'unauthorized' }); return
  }
  // A capability with no runner can never be renewed
  // into one that has one, since the runner must be carried unchanged.
  const runner = parseCapabilityRunner(payload.runner)
  if (!runner) {
    logger.warn('capability renewal refused: the capability names no runner')
    res.status(410).json({ error: 'Capability cannot be renewed' }); return
  }
  // Carried unchanged like the runner. A capability that does not say what
  // started its run is never renewed into one that does — guessing could only
  // make an automated run look person-started.
  const startedBy = parseRunStartedBy(payload.startedBy)
  if (!startedBy) {
    logger.warn('capability renewal refused: the capability does not say what started its run')
    res.status(410).json({ error: 'Capability cannot be renewed' }); return
  }
  try {
    const { token: renewed, expiresAt, claims } = await renewCapability({
      sessionId: payload.sessionId as string,
      agentId: payload.agentId as string,
      taskId: (payload.taskId as string | null) ?? null,
      runner,
      startedBy,
      onBehalfOfUserId: parseCapabilityOnBehalfOf(payload.onBehalfOfUserId) ?? undefined,
    })
    if (claims.siteId !== siteId) {
      logger.warn(`capability renewal refused: resolved site ${claims.siteId} does not match authenticated site ${siteId}`)
      res.status(410).json({ error: 'Capability cannot be renewed' }); return
    }
    res.json({ capability: renewed, expiresAt } satisfies CapabilityRenewResult)
  } catch (err: any) {
    // A SiteUnreachableError (the workspace/repo read inside resolveCapabilityClaims
    // hit a site that's momentarily offline) is transient, not "this capability
    // can never be renewed" — 410 would tell the runtime the session is over,
    // when reconnecting the site and retrying would succeed. Check this FIRST,
    // before the generic catch-all below turns every other failure into 410.
    if (err instanceof SiteUnreachableError) {
      logger.warn(`capability renewal deferred — ${err.message}`)
      res.status(503).json({ error: err.message })
      return
    }
    logger.warn(`capability renewal failed: ${err.message}`)
    res.status(410).json({ error: 'Capability cannot be renewed' })
  }
}
