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
import { parseCapabilityLivePreview, parseCapabilityPackageScopes, type CapabilityClaims } from '@agenthix/core'
import { resolvePlatformToken } from '../runtime/runTokens'
import { gateRunContext } from '../../agents/runtime/toolGateRuns'
import { verifyHqToken } from '../identity/verifyHqToken'
import { createMcpServer } from './mcpServer'
import { KNOWLEDGE_CHANGE_TOOLS } from './forwardedKnowledgeSchemas'
import { runHasWriteTools } from '../../agents/runtime/toolPermissions'
import { OPENCODE_HARNESS, PLATFORM_TOOLS_HARNESS_HEADER } from './siteTools'
import { refusePlatformCall } from './mcpCallGate'
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

  // A run that may change no files changes no knowledge either: its change tools are not offered (agent knowledge
  // spec, part 3). hq refuses them for it as well.
  const withheld = [
    ...claims.permissions.neverTools,
    ...(runHasWriteTools(claims.permissions) ? [] : KNOWLEDGE_CHANGE_TOOLS),
  ]
  const disabledTools = withheld.length > 0 ? new Set(withheld) : undefined

  // Every tool call passes the gate here too (mcpCallGate.ts), so it needs one call per request to decide on.
  const body = req.body as { method?: unknown; params?: { name?: unknown; arguments?: unknown } } | unknown[] | undefined
  if (Array.isArray(body) && body.some(m => (m as { method?: unknown } | null)?.method === 'tools/call')) {
    res.status(400).json({ error: 'Send each tool call in a request of its own. Nothing was run.' })
    return
  }
  const context = resolved.runId ? gateRunContext(resolved.runId) : null
  const turn = context && context.sessionId === claims.sessionId ? context : null
  const call = !Array.isArray(body) && body?.method === 'tools/call' && typeof body.params?.name === 'string' ? body.params : null
  const callRefusal = call ? await refusePlatformCall(turn, resolved.runId, call.name as string, call.arguments ?? {}) : null

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  // claims itself is not passed through — createMcpServer
  // has nothing to do with the verified claims object, only the two values
  // derived from it above (disabledTools) and the raw JWT (capabilityJwt).
  const mcpServer = createMcpServer({
    disabledTools,
    callRefusal,
    capabilityJwt: holder.jwt,
    livePreview: parseCapabilityLivePreview(claims.livePreview),
    trustedPackageScopes: parseCapabilityPackageScopes(claims.trustedPackageScopes),
    // The switches the turn was started with; with no turn running, none.
    features: turn?.features,
    siteTools: {
      // The turn's context, only while it runs and only as the conversation the capability names.
      context: turn,
      openCode: req.headers[PLATFORM_TOOLS_HARNESS_HEADER] === OPENCODE_HARNESS,
    },
  })
  // A harness keeps the tools it lists for the conversation's later runs: which ones a listing offered is logged, so a
  // run's tools can be told from its log (the names only, never an argument).
  if ((req.body as { method?: unknown } | undefined)?.method === 'tools/list') {
    logger.info(`tools listed for run ${resolved.runId ?? 'none'}: ${turn?.codeWork ? 'with' : 'without'} the code and app tools`)
  }
  await mcpServer.connect(transport)
  await transport.handleRequest(req, res, req.body)
}
