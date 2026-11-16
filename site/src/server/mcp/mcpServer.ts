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
 * (spec §7.2). A run is shown its must-have tools and finds the rest with
 * find_tools and use_tool (toolSearchTools.ts, ADR-0193).
 */
import { FIND_TOOLS, PLATFORM_TOOLS_INSTRUCTIONS, WITHDRAWN_FROM_AGENTS } from '@agenthix/core'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { callHqData, HqDataError } from '../hq/dataClient'
import { FORWARDED_TOOLS, type ForwardedTool } from './forwardedToolSchemas'
import { registerSiteTools, STOP_PROCESSES_TOOL, WEB_SEARCH_TOOL } from './siteTools'
import { CODE_TOOL_NAME_SET, SITE_CODE_TOOL_NAMES } from './forwardedCodeSchemas'
import { APP_TOOL_NAME_SET, appToolsOn } from './forwardedAppSchemas'
import { registerPreviewInstallTools } from './previewInstallTools'
import { runIsAsking } from '../../agents/runtime/askingRun'
import { unattendedAskTools } from '../../agents/runtime/toolPermissions'
import { SYSTEM_MCP_TOOLS } from '../../shared/mcpTools'
import { agentSchema, foldedAreaLines, isMustHave, registerToolSearchTools } from './toolSearchTools'
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
  /** The gate's refusal of the tool call this request carries (mcpCallGate.ts): every tool answers with it instead. */
  callRefusal?: string | null
}

/** A gate refusal, as text the model reads, like the harness's own refusals. */
function mcpRefusal(reason: string) {
  return { content: [{ type: 'text' as const, text: reason }], isError: true as const }
}

const NO_RUN = 'No run of this conversation is running, so nothing was recorded.'

// No `claims` field: every caller here already holds a
// capability verified upstream, in handler.ts — this module has nothing to
// do with the VERIFIED claims object itself, only the two derived values it
// actually reads (disabledTools, computed from claims.permissions.neverTools
// by the caller; capabilityJwt, the raw token). Carrying `claims` through
// unread would be dead weight with no enforcement value.
/** The tools the site serves itself: never folded, and never called through use_tool. */
const SITE_SERVED: ReadonlySet<string> = new Set([STOP_PROCESSES_TOOL, WEB_SEARCH_TOOL, ...SITE_CODE_TOOL_NAMES])

/**
 * The forwarded tools a run is offered, split into those it is shown in full and those it finds by search
 * (toolSearchTools.ts, ADR-0193). None at Never; the code tools for code work only. Every code-work run is offered
 * the app tools, whether or not its branch has a live preview now: a harness lists a conversation's tools once and
 * keeps them for its later runs, while a live preview opens and stops at any time. hq answers each call only while
 * the run's branch has a live preview on the run's site, and refuses it otherwise. None is offered while the live
 * preview is off for the run: a harness that kept them from an earlier listing finds no such tool here.
 */
/** Legacy tools a run is no longer offered; hq still serves them. */
const WITHDRAWN: ReadonlySet<string> = new Set(WITHDRAWN_FROM_AGENTS)

export function runForwardedTools(opts: CreateMcpServerOptions): { shown: Map<string, ForwardedTool>; folded: Map<string, ForwardedTool> } {
  const disabledTools = opts.disabledTools ?? new Set<string>()
  const turn = opts.siteTools?.context ?? null
  const livePreviewOn = appToolsOn(opts.features)
  const livePreview = livePreviewOn ? opts.livePreview ?? null : null
  const offered = FORWARDED_TOOLS.filter(({ name }) =>
    !disabledTools.has(name) && !WITHDRAWN.has(name) &&
    !(CODE_TOOL_NAME_SET.has(name) && !turn?.codeWork) &&
    !(APP_TOOL_NAME_SET.has(name) && (!livePreviewOn || (!livePreview && !turn?.codeWork))))
  // A tool at Ask in a run nobody can approve is refused on every call (toolGate.ts), so it is not found either.
  const unapprovable = new Set(turn ? unattendedAskTools(turn, offered.map(t => t.name)) : [])
  return {
    shown: new Map(offered.filter(t => isMustHave(t.name)).map(t => [t.name, t])),
    folded: new Map(offered.filter(t => !isMustHave(t.name) && !unapprovable.has(t.name)).map(t => [t.name, t])),
  }
}

export function createMcpServer(opts: CreateMcpServerOptions): McpServer {
  const disabledTools = opts.disabledTools ?? new Set<string>()
  const turn = opts.siteTools?.context ?? null
  const livePreview = appToolsOn(opts.features) ? opts.livePreview ?? null : null
  const callingRunId = turn?.runId ?? null
  const { shown, folded } = runForwardedTools(opts)
  const areas = foldedAreaLines([...folded.values()])

  const server = new McpServer(
    { name: 'agenthix-site', version: process.env.APP_VERSION || 'dev' },
    // What else the run can do is said beside the platform tools' instructions (ADR-0193).
    { instructions: areas ? `${PLATFORM_TOOLS_INSTRUCTIONS}\n\n${areas}` : PLATFORM_TOOLS_INSTRUCTIONS },
  )

  // Same disabledTools patch as hq's mcpServer.ts — §H6's workspace-intersection
  // can push an otherwise always-injected tool into neverTools for this run. A
  // tool call the gate refused (callRefusal) is answered with the refusal.
  const callRefusal = opts.callRefusal ?? null
  const orig = server.tool.bind(server)
  // `any`: McpServer.tool is overloaded; this patch forwards whichever form was called.
  ;(server as any).tool = (...args: unknown[]) => {
    const name = args[0] as string
    if (disabledTools.has(name)) return
    if (callRefusal !== null) args[args.length - 1] = async () => mcpRefusal(callRefusal)
    return (orig as (...a: unknown[]) => unknown)(...args)
  }

  // ── Site-local tools — touch no control-plane data ─────────────────────────

  registerSiteTools(server, opts.siteTools ?? { context: null, openCode: false })
  // Every code-work run installs through the rule (adr-0170): in its live preview when its capability names one, else in
  // its own container. While the live preview is off for the run, a live preview named is not used.
  if (livePreview || turn?.codeWork) {
    registerPreviewInstallTools(server, {
      claim: livePreview, trustedPackageScopes: opts.trustedPackageScopes ?? [], runId: callingRunId, context: turn,
    })
  }

  // ── Forwarded tools — thin callHqData(name, args, capabilityJwt) forwards ──

  const forward = async (tool: ForwardedTool, args: unknown) => {
    const { name } = tool
    if (tool.runIdFromCaller && !callingRunId) return mcpError(NO_RUN)
    const sent = tool.runIdFromCaller ? { ...(args as Record<string, unknown>), runId: callingRunId } : args
    try {
      // hq is told a run that has asked, so it holds the run's own task where it is (askingRun.ts).
      const result = turn && runIsAsking(turn)
        ? await callHqData(name, sent, opts.capabilityJwt, { waitingForApproval: true })
        : await callHqData(name, sent, opts.capabilityJwt)
      if (turn && name === SYSTEM_MCP_TOOLS.RUN.SET_RESULT) turn.resultStated = true
      return tool.textResult ? mcpText(result) : mcpOk(result)
    } catch (e) {
      if (e instanceof HqDataError) return mcpError(e.message)
      throw e
    }
  }

  for (const tool of shown.values()) {
    const { name, description } = tool
    const schema = agentSchema(tool)
    const handler = (args: unknown) => forward(tool, args)
    if (description) {
      // @ts-ignore TS2589
      server.tool(name, description, schema, handler)
    } else {
      // @ts-ignore TS2589
      server.tool(name, schema, handler)
    }
  }

  registerToolSearchTools(server, {
    folded, shown, siteServed: SITE_SERVED, forward,
    askHq: async (query, among) => {
      try {
        return await callHqData(FIND_TOOLS, { query, among }, opts.capabilityJwt)
      } catch (e) {
        if (e instanceof HqDataError) return { tools: [], note: `The search could not be run: ${e.message}` }
        throw e
      }
    },
  })

  return server
}
