/**
 * MCP Streamable HTTP Endpoint Handler — site's half (plan 5d-2 task 8).
 *
 * Moved from hq/src/server/mcp/handler.ts, with the static-key/admin branch
 * DROPPED (escalation rule: "the static-key/admin path stays on hq; only the
 * container-facing capability path moves"). Site's endpoint has exactly one
 * auth form:
 *
 * - Run token — an opaque, per-run token minted by AgentEngine
 *   (`runTokens.ts`'s `issueRunToken`) and resolved server-side to the run's
 *   live capability holder. The holder's JWT is verified here
 *   (`verifyHqToken`), and the VERIFIED claims become this request's identity
 *   and tool-filtering source. `verifyHqToken` always pins the audience to
 *   THIS site's own `siteId` (`identity/verifyHqToken.ts`) — the audience pin
 *   arrives by construction, not as a special case here (SC-348).
 *
 * No HQ connection is required for the endpoint to answer 401s correctly;
 * every forwarded tool call needs one (callHqData), same as hq's own data path.
 */
import type { ApiHandler } from '../http/apiHandler'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { CapabilityClaims } from '@agenthix/core'
import { resolvePlatformToken } from '../runtime/runTokens'
import { gateRunContext } from '../../agents/runtime/toolGateRuns'
import { verifyHqToken } from '../identity/verifyHqToken'
import { createMcpServer } from './mcpServer'
import { OPENCODE_HARNESS, PLATFORM_TOOLS_HARNESS_HEADER } from './siteTools'
import { Logger } from '../utils/logger'

const logger = new Logger('mcp')

export const mcpHandler: ApiHandler = async (req, res) => {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' })
    return
  }
  const token = authHeader.substring(7)

  const resolved = resolvePlatformToken(token)
  if (!resolved) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const { holder } = resolved

  let claims: CapabilityClaims
  try {
    claims = (await verifyHqToken(holder.jwt, 'capability')) as unknown as CapabilityClaims
  } catch (e) {
    // Fail closed, but stay visible: log the error CLASS only, never the
    // bearer or the holder JWT (mirrors hq's original handler.ts).
    logger.warn('capability verification failed', e instanceof Error ? e.name : 'unknown')
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const disabledTools = claims.permissions.neverTools.length > 0
    ? new Set(claims.permissions.neverTools)
    : undefined

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  // claims itself is not passed through — createMcpServer
  // has nothing to do with the verified claims object, only the two values
  // derived from it above (disabledTools) and the raw JWT (capabilityJwt).
  const context = resolved.runId ? gateRunContext(resolved.runId) : null
  const mcpServer = createMcpServer({
    disabledTools,
    capabilityJwt: holder.jwt,
    siteTools: {
      // The turn's context, only while it runs and only as the conversation the capability names.
      context: context && context.sessionId === claims.sessionId ? context : null,
      openCode: req.headers[PLATFORM_TOOLS_HARNESS_HEADER] === OPENCODE_HARNESS,
    },
  })
  await mcpServer.connect(transport)
  await transport.handleRequest(req, res, req.body)
}
