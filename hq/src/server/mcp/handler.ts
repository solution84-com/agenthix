/**
 * MCP Streamable HTTP Endpoint Handler
 * =====================================
 *
 * Implements the single route required by the MCP Streamable HTTP transport:
 *
 * - `POST /mcp` — Handles all MCP requests (stateless, one transport per request)
 *
 * ## Authentication (adr-0090)
 *
 * Agents never call this endpoint: they reach their site's own `/mcp`
 * (`site/src/server/mcp/handler.ts`), which forwards to hq's control-plane data
 * API (`server/controlplane/dataApi.ts`). What calls here is a tool outside the
 * product, and it authenticates with one of a person's own connections: the
 * caller is that person, with their reach and role, narrowed by the
 * connection's permission groups and project list. There is no org-wide key.
 *
 * Every refusal — an unknown, expired or revoked token, or a person no longer
 * in the org — is the same 401, so the response says nothing about which.
 */
import type { McpApi } from 'wasp/server/api'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { authenticateConnection } from '../../connections/connectionAuth'
import { createMcpServer } from './mcpServer'

export const mcpHandler: McpApi = async (req, res) => {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' })
    return
  }
  const grant = await authenticateConnection(authHeader.substring(7))
  if (!grant) {
    res.status(401).json({ error: 'Unauthorized: this connection is unknown, expired or revoked' })
    return
  }

  // Stateless: a fresh transport and server for every request.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  const mcpServer = createMcpServer({ caller: { kind: 'connection', connection: grant } })
  await mcpServer.connect(transport)
  await transport.handleRequest(req, res, req.body)
}
