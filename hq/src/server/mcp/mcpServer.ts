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
 * - `ping` — connectivity check
 * - `get_site_info` — HQ connection status
 * - `get_org` — org identity (name, vision, mission)
 * - `update_org` — update org name, vision, or mission
 * - `list_agents` — all agents
 * - `list_projects` — all projects
 * - `get_board` — board by ID
 * - `fetch_my_queued_tasks` — queued tasks for an agent
 * - `list_tasks` — flexible task query by project/board/agent/state/priority
 * - `get_task_details` — single task by ID (full detail)
 * - `list_teams` — all local teams
 * - `update_task` — patch task content fields
 * - `create_task` — create a new task
 * - `attach_file` — write a file to agent workspace
 * - `tick_subtask` — DEPRECATED
 * - `create_agent` — create a new agent with workspace
 * - `list_presets` — list available avatar or cover preset filenames
 * - `apply_agent_preset` — apply a preset image to an agent's avatar or cover
 * - `create_team` — create a new team
 * - `create_project` — create a new project
 * - `create_board` — create a board with default or custom columns, a workflow or a sprint board
 * - `finish_sprint`, `rename_sprint` — a sprint board's sprints
 * - `list_milestones`, `create_milestone`, `update_milestone`, `delete_milestone` — a project's milestones
 * - `add_comment` — post a comment on a task
 * - `run_task` — start a run of a queued task by its assigned agent; returns at once
 * - `get_github_config` — get the site GitHub integration config
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { registerWorkforceTools } from './workforceTools'
import { runStartPreview } from '../../preview/startPreviewTool'
import { resolvePreviewBoundary } from '../../preview/previewBoundary'
import { createPreview, markStatus } from '../../preview/previewRegistry'
import { hqBaseUrl, previewDomain, PREVIEW_TTL_MS } from '../../preview/previewWiring'
import { siteChannelRegistry } from '../../sites/channel'
import { callOperation } from '../controlplane/operations'
import { ControlPlaneError, type CallerContext } from '../controlplane/types'
import { CONTROL_PLANE_TOOLS } from '../controlplane/toolSchemas'
import { BRANDING } from '@agenthix/core'

// ── Response helpers ──────────────────────────────────────────────────────────

function mcpOk(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] }
}

function mcpError(message: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
    isError: true as const,
  }
}

/** Shape of the `runOp` helper below — shared with workforceTools.ts so it
 *  dispatches through the same control-plane registry rather than duplicating
 *  the try/catch-and-render logic. */
export type RunOp = (name: string, args: unknown) => Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: true }>

// ── MCP Server ────────────────────────────────────────────────────────────────

export function createMcpServer(opts: { caller: CallerContext; disabledTools?: Set<string> }): McpServer {
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
        '- Call add_comment at least once before finishing — report what you did, the result, or why you could not proceed.',
        '- Update subtasks via update_task as you complete each step, not just at the end. Humans may be watching progress in real time.',
        '- Move the task to the appropriate board column via update_task(column="...") when done, or when it needs review. That is how you say a task is finished, blocked or needs a person — with a comment saying why.',
        '- Only create a follow-up task via create_task for work that is clearly out of scope. If it is small enough to mention in the result summary, do that instead.',
        '- When creating tasks via create_task: pass queue: true if the task should wait to be started by the project\'s pulse; leave it out (the default) for backlog tasks or follow-up work that a human should review first.',
        '- Do not call run_task on a task you just created in the same session — leave it queued, or wait for a human to review it first.',
      ].join('\n'),
    },
  )

  // When called with disabledTools, patch server.tool to skip never-state tools.
  // This filters tools/list so Claude never sees tools named here. Usually that's
  // an agent's own 'never' config, but H6's workspace-intersection can also push
  // an otherwise always-injected tool into neverTools for this run — disabledTools
  // just reflects whatever the caller (handler.ts, from verified claims) computed.
  if (opts.disabledTools?.size) {
    const disabledTools = opts.disabledTools
    const orig = server.tool.bind(server)
    ;(server as any).tool = (...args: unknown[]) => {
      const name = args[0] as string
      if (disabledTools.has(name)) return
      return (orig as (...a: unknown[]) => unknown)(...args)
    }
  }

  // ping, get_site_info and start_preview stay wired directly (not via runOp):
  // the first two touch no control-plane data at all, and start_preview is
  // site-local — it moves to site's own MCP surface in plan 5d, not here.

  server.tool('ping', {}, async () =>
    mcpOk({ pong: true, timestamp: new Date().toISOString() })
  )

  server.tool('get_site_info', {}, async () =>
    mcpOk({ status: 'standalone', mode: 'standalone' })
  )

  // start_preview — only available to agent-run callers (verified capability
  // claims). A person's connection is not a run and never gets it. The agent and the session both come from the
  // claims, NOT from the model, so a run can only ever preview the working tree
  // of the storage it works in; it cannot name another agent's or another
  // boundary's. (ADR-0036 isolation.) That is what makes it safe for hq to ask
  // a site to run this command inside the boundary's container: the caller is
  // already in that container — see previewBoundary.ts. The rows behind those
  // ids are read at call time rather than here at construction, keeping
  // createMcpServer itself synchronous.
  if (callerCtx.kind === 'run') {
    const { agentId, sessionId } = callerCtx.claims
    server.tool(
      'start_preview',
      'Start a live web preview of your working tree and return a URL the operator can open. ' +
        'The command runs from your workspace ROOT, so if your app is in a subfolder you MUST cd into it first. ' +
        'Bind the dev server to 0.0.0.0 (not localhost) or it will be unreachable. ' +
        'Present the returned URL to the operator as a plain or markdown link — do NOT wrap it in bold, which stops it rendering as a clickable link.',
      {
        command: z.string().describe('Dev-server command, run from the workspace root. cd into the app folder if it is in a subdirectory and bind 0.0.0.0 — e.g. "cd myapp && npm run dev -- --host 0.0.0.0 --port 5173"'),
        port: z.number().int().describe('Port the dev server binds inside the container, e.g. 5173'),
      },
      async ({ command, port }: { command: string; port: number }) => {
        try {
          const result = await runStartPreview({ command, port }, {
            resolveTarget: () => resolvePreviewBoundary({ agentId, sessionId }),
            request: (siteId, method, params) => siteChannelRegistry.request(siteId, method, params),
            createPreview,
            markStatus,
            hqUrl: hqBaseUrl(),
            previewDomain: previewDomain(),
            ttlMs: PREVIEW_TTL_MS,
          })
          return mcpOk(result)
        } catch (e) {
          return mcpError(e instanceof Error ? e.message : 'preview failed')
        }
      },
    )
  }

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
