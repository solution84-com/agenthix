import { prisma } from '#db'
import { Logger } from './utils/logger'

const logger = new Logger('site')

/**
 * Where an agent container reaches this site's `/mcp` and git-credential
 * endpoints (ADR-0066). Not the site's public address: a deployed site has
 * none, and agents reach it over their own network by container name.
 */
export function getAgentFacingSiteUrl(): string {
  const explicit = process.env.SITE_AGENT_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  const port = process.env.PORT || '4201'
  if (process.env.SITE_CONTAINER_NAME) return `http://${process.env.SITE_CONTAINER_NAME}:${port}`
  if (process.env.AGENT_CONTAINER_ISOLATION === 'true') return `http://host.docker.internal:${port}`
  return `http://localhost:${port}`
}

/**
 * SiteConfig carries this installation's stable identity — the `siteId` that hq
 * records in its ExecutionSite registry and that every control-channel frame
 * names. Nothing created it, so a fresh site could not register at all:
 * registering threw "SiteConfig is missing" and there was no way to make one.
 *
 * Every column has a default (siteId is a uuid), so the row is created empty and
 * the identity is generated once, here, at first boot. It is never rotated —
 * rotating it would orphan every project hq has placed on this machine.
 */
export async function ensureSiteConfig(): Promise<{ siteId: string }> {
  const existing = await prisma.siteConfig.findFirst()
  if (existing) return { siteId: existing.siteId }

  const created = await prisma.siteConfig.create({ data: { id: 'singleton' } })
  logger.info(`Generated this installation's identity: ${created.siteId}`)
  return { siteId: created.siteId }
}
