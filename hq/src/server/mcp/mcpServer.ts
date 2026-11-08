/**
 * MCP Server Factory
 * ===================
 *
 * Exports `createMcpServer`, which creates a fresh `McpServer` instance with
 * all tools registered. Called once per incoming MCP request — a new server
 * instance is created for each request in stateless Streamable HTTP mode.
 *
 * Tool handlers are thin wrappers: parse input → dispatch to the control-plane
 * operations registry → format response. Business logic (including
 * authorization) lives in src/server/controlplane/*Ops.ts, not here.
 *
 * ## Tools
 *
 * - `ping` and `get_site_info` — answered here; they touch no data
 * - every tool of `CONTROL_PLANE_TOOLS` (controlplane/toolSchemas.ts), each dispatched through `callOperation`
 * - the workforce tools (workforceTools.ts)
 *
 * A person's connection is the only caller (handler.ts), and `callOperation` limits it to the tools its permission
 * groups cover.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { registerWorkforceTools } from './workforceTools'
import { callOperation } from '../controlplane/operations'
import { ControlPlaneError, type CallerContext } from '../controlplane/types'
import { CONTROL_PLANE_TOOLS } from '../controlplane/toolSchemas'
import { BRANDING, TASK_MODEL_CONCEPTS } from '@agenthix/core'

// ── Response helpers ──────────────────────────────────────────────────────────

function mcpOk(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] }
}

/** Shape of the `runOp` helper below — shared with workforceTools.ts so it
 *  dispatches through the same control-plane registry rather than duplicating
 *  the try/catch-and-render logic. */
export type RunOp = (name: string, args: unknown) => Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: true }>

// ── MCP Server ────────────────────────────────────────────────────────────────

export function createMcpServer(opts: { caller: CallerContext }): McpServer {
  // Every data-touching tool dispatches through the control-plane operations
  // registry (src/server/controlplane), which owns authorization itself — this
  // wiring stays thin (spec §7.2, plan 5b-2 tasks 3–4).
  const callerCtx = opts.caller
  const runOp: RunOp = async (name, args) => {
    try {
      const result = await callOperation(name, callerCtx, args)
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
    } catch (e) {
      if (e instanceof ControlPlaneError) return { isError: true, content: [{ type: 'text' as const, text: e.message }] }
      throw e
    }
  }

  const server = new McpServer(
    { name: 'hq', version: '1.0.0' },
    {
      instructions: [
        `${BRANDING.displayName} task management tools, for working on the organisation's tasks as the person who made this connection.`,
        '',
        'Key concepts:',
        ...TASK_MODEL_CONCEPTS,
        '',
        'Working with these tools:',
        '- Report on a task with add_comment: what was done, the result, or why it could not proceed. The comment is posted as the person who made this connection.',
        '- Move a task with update_task (its columnId, or its state) to say it is finished, blocked or needs a person, and add a comment saying why.',
        '- Create a task with create_task for new work: it starts in Backlog unless you name a column or a state, and nothing starts it until someone does.',
        '- Do not call run_task on a task that was just created unless the person asked for it to start.',
        '- Starting work (run_task, create_task with queue: true, set_task_schedule) and routines need this connection\'s Start work permission; what they start is on behalf of the person who made this connection.',
      ].join('\n'),
    },
  )

  // ping and get_site_info stay wired directly (not via runOp): they touch no
  // control-plane data at all.

  server.tool('ping', {}, async () =>
    mcpOk({ pong: true, timestamp: new Date().toISOString() })
  )

  server.tool('get_site_info', {}, async () =>
    mcpOk({ status: 'standalone', mode: 'standalone' })
  )

  // Every control-plane tool's {name, description?, schema} lives in
  // toolSchemas.ts (file-size rule); every one dispatches through runOp,
  // which is what does the try/catch-and-render and the control-plane
  // registry lookup. See toolSchemas.ts's header for why a uniform
  // `runOp(name, args)` passthrough is safe even for the schemas that accept
  // a client-supplied `createdBy` no op actually reads.
  for (const { name, description, schema } of CONTROL_PLANE_TOOLS) {
    const handler = async (args: unknown) => runOp(name, args)
    if (description) {
      // @ts-ignore TS2589
      server.tool(name, description, schema, handler)
    } else {
      // @ts-ignore TS2589
      server.tool(name, schema, handler)
    }
  }

  // Workforce tools (list_workforce_templates, propose_workforce_template)
  registerWorkforceTools(server, { runOp })

  return server
}
