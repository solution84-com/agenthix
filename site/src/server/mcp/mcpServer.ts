/**
 * MCP Server Factory — site's half (plan 5d-2 task 8).
 *
 * Moved from hq/src/server/mcp/mcpServer.ts's schema-and-wiring shape, with
 * the two things that stay hq-only dropped per the task's escalation rule:
 * the static-key/admin auth branch (site's MCP endpoint has no such branch —
 * every caller here already holds a verified run capability, resolved by
 * handler.ts) and the workforce-tools split module (folded into the same
 * forwarding loop below — site has no local workforce logic to keep separate
 * from the generic loop the way hq's mcpServer.ts/workforceTools.ts do).
 *
 * Every data-touching tool forwards through `callHqData` — hq's own
 * control-plane registry owns authorization and does the real work
 * (spec §7.2). `ping`/`get_site_info` are genuinely local: they touch no
 * data at all. Full classification list is in this task's completion report.
 */
import { BRANDING } from '@agenthix/core'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { callHqData, HqDataError } from '../hq/dataClient'
import type { ZodRawShape } from 'zod'
import { FORWARDED_TOOLS, type ForwardedTool } from './forwardedToolSchemas'
import { registerSiteTools } from './siteTools'
import type { SiteToolsOptions } from './siteTools'

function mcpOk(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] }
}

function mcpError(message: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
    isError: true as const,
  }
}

export interface CreateMcpServerOptions {
  disabledTools?: Set<string>
  /** The raw capability JWT — what `callHqData` presents as `X-Run-Capability`. */
  capabilityJwt: string
  /** The turn the caller acts for, for the tools the site serves itself (siteTools.ts). */
  siteTools?: SiteToolsOptions
}

const NO_RUN = 'No run of this conversation is running, so nothing was recorded.'

/** What the agent is shown of a tool: a field the site fills in from the calling run is not the agent's to give. */
function agentSchema(tool: ForwardedTool): ZodRawShape {
  if (!tool.runIdFromCaller) return tool.schema
  const { runId: _filledIn, ...shown } = tool.schema
  return shown
}
// No `claims` field: every caller here already holds a
// capability verified upstream, in handler.ts — this module has nothing to
// do with the VERIFIED claims object itself, only the two derived values it
// actually reads (disabledTools, computed from claims.permissions.neverTools
// by the caller; capabilityJwt, the raw token). Carrying `claims` through
// unread would be dead weight with no enforcement value.

export function createMcpServer(opts: CreateMcpServerOptions): McpServer {
  const server = new McpServer(
    { name: 'agenthix-site', version: '1.0.0' },
    {
      instructions: [
        `${BRANDING.displayName} task management tools are available in this session.`,
        '',
        'Key concepts:',
        '- A task is always on one board (its project\'s Project Tasks unless put on another), and either in one of the board\'s columns (`column`, e.g. "todo", "in_progress", "done") or in the board\'s Backlog (`column` null).',
        '- `status` = the task\'s state (TODO | IN_PROGRESS | DONE), following its column; move a task by its column, never by its status.',
        '- `runState` = whether a run of the task is pending or going now (RUN_NONE | RUN_QUEUED | RUN_THROTTLED | RUN_ACTIVE | RUN_BLOCKED | RUN_FAILED). Set by the system only, never by you; independent of column/status. Whether a task is done is its column.',
        '- The Backlog starts nothing: a task there cannot be executed. To make it executable: update_task(column="..."). Moved to another board, a task lands in that board\'s Backlog.',
        '- A task\'s plan (planStart, planFinish) is when its work is meant to happen; setting it starts nothing. Its start time (set_task_schedule) is when its agent starts. An epic groups tasks; a milestone is a dated goal an epic belongs to.',
        '- On a sprint board, a task in a column is in the current sprint. finish_sprint needs you to say where the unfinished tasks go.',
        '',
        'Rules for using these tools:',
        '- Call set_result once at the end with what this run achieved, or why it could not. Use add_comment for what others working on the task should see.',
        '- Update subtasks via update_task as you complete each step, not just at the end. Humans may be watching progress in real time.',
        '- Move the task to the appropriate board column via update_task(column="...") when done, or when it needs review. That is how you say a task is finished, blocked or needs a person — with a comment saying why.',
        '- Only create a follow-up task via create_task for work that is clearly out of scope. If it is small enough to mention in the result summary, do that instead.',
        '- When creating tasks via create_task: pass queue: true if the task should wait to be started by the project\'s pulse; leave it out (the default) for backlog tasks or follow-up work that a human should review first.',
        '- Do not call run_task on a task you just created in the same session — leave it queued, or wait for a human to review it first.',
        '',
        'Processes you leave running:',
        '- Each command you run is sandboxed on its own, so `kill` or `pkill` from a command cannot stop a process an earlier command started (a dev server, a watcher). Call stop_processes with text from its command line instead; it stops only this conversation\'s own processes.',
      ].join('\n'),
    },
  )

  // Same disabledTools patch as hq's mcpServer.ts — §H6's workspace-intersection
  // can push an otherwise always-injected tool into neverTools for this run.
  if (opts.disabledTools?.size) {
    const disabledTools = opts.disabledTools
    const orig = server.tool.bind(server)
    ;(server as any).tool = (...args: unknown[]) => {
      const name = args[0] as string
      if (disabledTools.has(name)) return
      return (orig as (...a: unknown[]) => unknown)(...args)
    }
  }

  // ── Genuinely site-local tools — touch no control-plane data at all ────────

  server.tool('ping', {}, async () => mcpOk({ pong: true, timestamp: new Date().toISOString() }))

  server.tool('get_site_info', {}, async () => mcpOk({ status: 'standalone', mode: 'standalone' }))

  registerSiteTools(server, opts.siteTools ?? { context: null, openCode: false })

  // ── Forwarded tools — thin callHqData(name, args, capabilityJwt) forwards ──

  const callingRunId = opts.siteTools?.context?.runId ?? null

  for (const tool of FORWARDED_TOOLS) {
    const { name, description } = tool
    const schema = agentSchema(tool)
    const handler = async (args: unknown) => {
      if (tool.runIdFromCaller && !callingRunId) return mcpError(NO_RUN)
      const sent = tool.runIdFromCaller ? { ...(args as Record<string, unknown>), runId: callingRunId } : args
      try {
        const result = await callHqData(name, sent, opts.capabilityJwt)
        return mcpOk(result)
      } catch (e) {
        if (e instanceof HqDataError) return mcpError(e.message)
        throw e
      }
    }
    if (description) {
      // @ts-ignore TS2589
      server.tool(name, description, schema, handler)
    } else {
      // @ts-ignore TS2589
      server.tool(name, schema, handler)
    }
  }

  return server
}
