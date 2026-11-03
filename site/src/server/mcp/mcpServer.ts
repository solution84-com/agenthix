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
import { PLATFORM_TOOLS_INSTRUCTIONS } from '@agenthix/core'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { callHqData, HqDataError } from '../hq/dataClient'
import type { ZodRawShape } from 'zod'
import { FORWARDED_TOOLS, type ForwardedTool } from './forwardedToolSchemas'
import { registerSiteTools } from './siteTools'
import { CODE_TOOL_NAME_SET } from './forwardedCodeSchemas'
import { APP_TOOL_NAME_SET, appToolsOn } from './forwardedAppSchemas'
import { registerPreviewInstallTools } from './previewInstallTools'
import type { CapabilityLivePreview, FeatureSwitches } from '@agenthix/core'
import type { SiteToolsOptions } from './siteTools'

function mcpOk(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] }
}

/** A tool that answers text, as the native Grep and Read do: given to the agent as it is. */
function mcpText(data: unknown) {
  return typeof data === 'string' ? { content: [{ type: 'text' as const, text: data }] } : mcpOk(data)
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
  /** The live preview the run's verified capability names: its package tools install there, and a run that is not code work is offered the app tools only with it. */
  livePreview?: CapabilityLivePreview | null
  /** The organisation's trusted npm scopes, read off the verified capability: the package tools' rule trusts these. */
  trustedPackageScopes?: readonly string[]
  /**
   * The organisation's switches the run was started with (adr-0172); absent means none. While the live preview is off
   * for them, the app tools are not offered and the capability's live preview is not used.
   */
  features?: FeatureSwitches
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
    { name: 'agenthix-site', version: process.env.APP_VERSION || 'dev' },
    {
      instructions: PLATFORM_TOOLS_INSTRUCTIONS,
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
  // Every code-work run installs through the rule (adr-0170): in its live preview when its capability names one, else in
  // its own container. While the live preview is off for the run, a live preview named is not used.
  const turn = opts.siteTools?.context ?? null
  const livePreviewOn = appToolsOn(opts.features)
  const livePreview = livePreviewOn ? opts.livePreview ?? null : null
  if (livePreview || turn?.codeWork) {
    registerPreviewInstallTools(server, {
      claim: livePreview, trustedPackageScopes: opts.trustedPackageScopes ?? [], runId: turn?.runId ?? null, context: turn,
    })
  }

  // ── Forwarded tools — thin callHqData(name, args, capabilityJwt) forwards ──

  const callingRunId = opts.siteTools?.context?.runId ?? null

  for (const tool of FORWARDED_TOOLS) {
    const { name, description } = tool
    if (CODE_TOOL_NAME_SET.has(name) && !opts.siteTools?.context?.codeWork) continue
    // Every code-work run is offered the app tools, whether or not its branch has a live preview now: a harness lists
    // a conversation's tools once and keeps them for its later runs, while a live preview opens and stops at any time.
    // hq answers each call only while the run's branch has a live preview on the run's site, and refuses it otherwise.
    // None is offered while the live preview is off for the run: a harness that kept them from an earlier listing finds
    // no such tool here.
    if (APP_TOOL_NAME_SET.has(name) && (!livePreviewOn || (!livePreview && !opts.siteTools?.context?.codeWork))) continue
    const schema = agentSchema(tool)
    const handler = async (args: unknown) => {
      if (tool.runIdFromCaller && !callingRunId) return mcpError(NO_RUN)
      const sent = tool.runIdFromCaller ? { ...(args as Record<string, unknown>), runId: callingRunId } : args
      try {
        const result = await callHqData(name, sent, opts.capabilityJwt)
        return tool.textResult ? mcpText(result) : mcpOk(result)
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
