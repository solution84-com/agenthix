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
import { BRANDING } from '@agenthix/core'

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
        '- A task is always on one board (its project\'s Project Tasks unless put on another), and either in one of the board\'s columns (`column`, e.g. "todo", "in_progress", "done") or in the board\'s Backlog (`column` null).',
        '- `status` = the task\'s state (TODO | IN_PROGRESS | DONE), following its column; move a task by its column, never by its status.',
        '- `runState` = whether a run of the task is pending or going now (RUN_NONE | RUN_QUEUED | RUN_THROTTLED | RUN_ACTIVE | RUN_BLOCKED | RUN_FAILED). Set by the system only, never by you; independent of column/status. Whether a task is done is its column.',
        '- The Backlog starts nothing: a task there cannot be executed. To make it executable: update_task(column="..."). Moved to another board, a task lands in that board\'s Backlog.',
        '- A task\'s plan (planStart, planFinish) is when its work is meant to happen; setting it starts nothing. Its start time (set_task_schedule) is when its agent starts. An epic groups tasks; a milestone is a dated goal an epic belongs to.',
        '- On a sprint board, a task in a column is in the current sprint. finish_sprint needs you to say where the unfinished tasks go.',
        '',
        'Working with these tools:',
        '- Report on a task with add_comment: what was done, the result, or why it could not proceed. The comment is posted as the person who made this connection.',
        '- Keep a task\'s subtasks current with update_task as each step is done, not only at the end. People may be watching the board.',
        '- Move a task to the right board column with update_task(column="...") to say it is finished, blocked or needs a person, and add a comment saying why.',
        '- Create a task with create_task for new work. Pass queue: true if it should wait to be started by the project\'s pulse; leave it out (the default) for backlog tasks that a person should review first.',
        '- Do not call run_task on a task that was just created unless the person asked for it to start; left queued, it waits for review.',
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
