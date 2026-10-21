/**
 * Workforce MCP Tools
 * ===================
 *
 * Registers the `list_workforce_templates` and `propose_workforce_template`
 * tools on the MCP server. Called from mcpServer.ts during server setup.
 *
 * Both tools dispatch through the same control-plane operations registry as
 * every other data-touching tool (spec §7.2, plan 5b-2 task 4) — the service
 * logic (finding/creating the Workforce Assembly board, writing the template
 * artefact, the role floor) lives in controlplane/workforceOps.ts, not here.
 *
 * Schemas live in controlplane/toolSchemas.ts's WORKFORCE_TOOLS (plan 5b-2
 * task 5 review, C1) — the same table dataApi.ts validates the HTTP path
 * against — registered here rather than by mcpServer.ts's generic loop only
 * so the two loops never both register the same tool name.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WORKFORCE_TOOLS } from '../controlplane/toolSchemas'
import type { RunOp } from './mcpServer'

export function registerWorkforceTools(server: McpServer, { runOp }: { runOp: RunOp }): void {
  for (const { name, description, schema } of WORKFORCE_TOOLS) {
    const handler = async (args: unknown) => runOp(name, args)
    if (description) {
      // @ts-ignore TS2589
      server.tool(name, description, schema, handler)
    } else {
      // @ts-ignore TS2589
      server.tool(name, schema, handler)
    }
  }
}
