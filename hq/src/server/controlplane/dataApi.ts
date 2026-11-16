/**
 * POST /api/v1/data — the site → hq data path (spec §7.2, plan 5b-2 task 5).
 * The path is written out in main.wasp.ts's declaration; site's client
 * (site/src/server/hq/dataClient.ts) imports this same path as HQ_DATA_PATH
 * from @agenthix/core (core/src/protocol/capability.ts).
 *
 * Auth is deliberately NOT Wasp auth (auth: false in main.wasp.ts) and deliberately
 * NOT mcpHandler's (a person's own connection token, adr-0090). A site
 * calling this on an agent's behalf authenticates with two things layered:
 *
 * 1. Its own machine credential (Authorization: Bearer <credential>) plus the
 *    X-Site-Id header naming which ExecutionSite it claims to be —
 *    authenticateSite (registrationService.ts) verifies the pair against the
 *    stored credential hash. The "Bearer " prefix is matched case-sensitively
 *    on purpose — our own site client always sends exactly this, and a
 *    case-insensitive match would just be extra surface for no real client.
 * 2. A capability JWT (X-Run-Capability) minted for the run this call acts
 *    for. This endpoint pins the audience to the X-Site-Id the caller just
 *    proved it is — a capability minted for one site is refused here if
 *    presented by a different site, because a different site cannot pass
 *    step 1 for that siteId in the first place. (hq's own /mcp endpoint,
 *    server/mcp/handler.ts, verifies no capability at all: it accepts only
 *    a person's connection.)
 *
 * Every data call acts for a run — a person's connection reaches hq's /mcp
 * endpoint instead, never this one.
 *
 * Boundary validation (plan 5b-2 task 5 review, C1): the MCP transport gets
 * its args shape enforced by the MCP SDK against each tool's zod schema
 * (mcpServer.ts, toolSchemas.ts) before a handler ever runs. Nothing did that
 * here — `args` arrived as whatever JSON the caller sent, straight into
 * callOperation, and at least two ops (createProductOp/updateProductOp)
 * used to spread that object verbatim into a Prisma `data:` write, so an
 * extra key could ride along as a nested relation write (e.g.
 * `projects: { connect: [...] }`). Every operation here now gets the SAME
 * zod schema the MCP tool uses, via `z.object(schema).safeParse(args ?? {})`
 * — safeParse both rejects a shape it can't validate (400) and, on success,
 * strips any key the schema doesn't declare, so what reaches callOperation
 * is never wider than what the MCP path already allowed.
 */
import type { DataApi } from 'wasp/server/api'
import { prisma } from 'wasp/server'
import { z } from 'zod'
import { RUN_WAITING_APPROVAL_HEADER, type CapabilityClaims } from '@agenthix/core'
import { authenticateSite } from '../../sites/registrationService'
import { verifyHqToken } from '../identity/tokenService'
import { callOperation } from './operations'
import { ControlPlaneError, type ControlPlaneErrorCode } from './types'
import { ALL_CONTROL_PLANE_TOOLS } from './toolSchemas'
import { FIND_TOOLS_SCHEMA } from './findToolsOp'
import { Logger } from '../utils/logger'

const logger = new Logger('DataApi')

const STATUS: Record<ControlPlaneErrorCode, number> = { forbidden: 403, not_found: 404, invalid: 400, conflict: 409, unavailable: 503 }

// A Map, not a plain object: a caller-supplied operation name like
// "constructor" or "__proto__" has no special meaning as a Map key — unlike
// `SCHEMAS[name]` on a plain object, which would resolve through
// Object.prototype to a real (non-schema) value. Same reasoning as
// callOperation's hasOwnProperty guard (operations.ts, review I2), enforced
// here by data structure instead of by an extra check.
// find_tools is not one of the tools it searches, so it is not in ALL_CONTROL_PLANE_TOOLS.
const SCHEMAS = new Map([...ALL_CONTROL_PLANE_TOOLS, FIND_TOOLS_SCHEMA].map(t => [t.name, z.object(t.schema)]))

export const dataHandler: DataApi = async (req, res) => {
  const auth = req.headers.authorization
  const siteId = req.headers['x-site-id']
  if (!auth?.startsWith('Bearer ') || typeof siteId !== 'string' || !siteId) {
    res.status(401).json({ error: 'unauthorized' }); return
  }
  const site = await authenticateSite(siteId, auth.slice('Bearer '.length))
  if (!site) { res.status(401).json({ error: 'unauthorized' }); return }

  const capabilityJwt = req.headers['x-run-capability']
  if (typeof capabilityJwt !== 'string' || !capabilityJwt) {
    // Every data call acts for a run.
    res.status(401).json({ error: 'unauthorized' }); return
  }
  let claims: CapabilityClaims
  try {
    // Audience pinned: the caller just proved, via its machine credential,
    // that it IS siteId — so a capability minted for a different site is
    // refused rather than silently accepted.
    claims = (await verifyHqToken(capabilityJwt, 'capability', siteId)) as unknown as CapabilityClaims
  } catch (e) {
    logger.warn('capability rejected', e instanceof Error ? e.name : 'unknown')
    res.status(401).json({ error: 'unauthorized' }); return
  }

  // A capability stays valid for its whole TTL, so one minted before its
  // project was deleted would otherwise keep acting for it — git credentials
  // for the project's repo included. A run with no project (personal storage)
  // has nothing to check.
  if (claims.projectId !== null && !(await projectExists(claims.projectId))) {
    res.status(403).json({ error: 'This run\'s project no longer exists' }); return
  }

  const { operation, args } = (req.body ?? {}) as { operation?: unknown; args?: unknown }
  if (typeof operation !== 'string') { res.status(400).json({ error: 'operation is required' }); return }

  const schema = SCHEMAS.get(operation)
  if (!schema) { res.status(404).json({ error: `Unknown operation: ${operation}` }); return }

  // Missing args, non-object args, and a caller-supplied key no schema
  // declares are all the same 400 here — safeParse rejects the first two
  // outright and, on success, `.data` never carries the third (review I4).
  const parsed = schema.safeParse(args ?? {})
  if (!parsed.success) {
    res.status(400).json({ error: `Invalid args for ${operation}: ${parsed.error.issues.map(i => i.message).join('; ')}` })
    return
  }

  try {
    // The site's own word, as trusted as the rest of its call: it is what holds the run's request.
    const waitingForApproval = req.headers[RUN_WAITING_APPROVAL_HEADER.toLowerCase()] === '1'
    const result = await callOperation(operation, { kind: 'run', claims, ...(waitingForApproval ? { waitingForApproval } : {}) }, parsed.data)
    res.json({ result })
  } catch (e) {
    if (e instanceof ControlPlaneError) { res.status(STATUS[e.code]).json({ error: e.message }); return }
    logger.error('operation failed', e instanceof Error ? e.name : 'unknown')
    res.status(500).json({ error: 'internal error' })
  }
}

async function projectExists(projectId: string): Promise<boolean> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })
  return project !== null
}
