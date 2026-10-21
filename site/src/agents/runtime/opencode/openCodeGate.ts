/**
 * OpenCode's adapter onto the tool gate (toolGate.ts): the site's end of the
 * plugin's gate call (spec, "Per-call authorization gate" item 3).
 *
 * The plugin sends every call it is about to run, as OpenCode's tool id and
 * full arguments; this translates it (openCodeNames.ts), runs the shared
 * decision on the running turn's context, and answers in the plugin's terms:
 * allow — carrying the arguments with each checked path's real path when one
 * led through a link — or refuse with the same steering text Claude's gate
 * gives. Finding the turn from the conversation's token is the endpoint's job
 * (server/harness/harnessGateApi.ts).
 */
import path from 'node:path'
import { HARNESS_GATE_UNAVAILABLE } from '@agenthix/core'
import type { HarnessGateRequest, HarnessGateResponse } from '@agenthix/core'
import { decideToolCall, recordToolCall } from '../toolGate'
import { containerHarnessPathPolicy, hostHarnessPathPolicy } from '../harnessPathRule'
import type { HarnessPathPolicy, RealPathResolver } from '../harnessPathRule'
import { HARNESS_HOME_CONTAINER_DIR } from '../harnessHomes'
import type { RunContext } from '../types'
import { openCodeGateCall } from './openCodeNames'
import { openCodeConnectionName } from './openCodeConnection'
import { Logger } from '../../../server/utils/logger'

const logger = new Logger('OpenCodeGate')

/**
 * Where OpenCode saves a tool's whole output when it cuts what the model sees
 * (`Truncate`, `tool/truncate.ts`: `$XDG_DATA_HOME/opencode/tool-output`), and
 * then tells the model to read it with `read` or `grep`. The server runs with
 * the home's default data folder, so it is here.
 */
export const OPENCODE_TOOL_OUTPUT_DIR = '.local/share/opencode/tool-output'

const stagedSkills = new Map<string, string>()

/**
 * The folder, as the harness sees it, where a conversation's skills are staged
 * for its current turn (spec §7), which OpenCode's read-only file tools may
 * read; null when it has none. The skill staging sets it each turn.
 */
export function setOpenCodeSkillsDir(conversationId: string, dir: string | null): void {
  if (dir) stagedSkills.set(conversationId, dir)
  else stagedSkills.delete(conversationId)
}

export interface OpenCodeGateOptions {
  /** Overrides how paths are resolved (tests). */
  resolveRealPath?: RealPathResolver
}

/**
 * Where OpenCode's file tools may not go: the image user's home and `/proc`
 * in a container, the runner's harness home and `/proc` on this machine.
 * Readable inside them: OpenCode's saved tool output, and the skills staged
 * for this conversation.
 */
export function openCodeHarnessPathPolicy(context: RunContext, options: OpenCodeGateOptions = {}): HarnessPathPolicy {
  const skills = stagedSkills.get(context.sessionId)
  if (context.containerName) {
    const readable = [path.posix.join(HARNESS_HOME_CONTAINER_DIR, OPENCODE_TOOL_OUTPUT_DIR), ...(skills ? [skills] : [])]
    return containerHarnessPathPolicy(context.containerName, context.cwd, readable, options.resolveRealPath)
  }
  const home = path.posix.dirname(context.claudeHome.visibleDir)
  const readable = [path.posix.join(home, OPENCODE_TOOL_OUTPUT_DIR), ...(skills ? [skills] : [])]
  return hostHarnessPathPolicy(context.cwd, [home], readable, options.resolveRealPath)
}

/** The gate's answer to one call from Agenthix's plugin, for the running turn `context`. Never rejects. */
export async function decideOpenCodeCall(
  context: RunContext,
  request: HarnessGateRequest,
  options: OpenCodeGateOptions = {},
): Promise<HarnessGateResponse> {
  try {
    const mapped = openCodeGateCall(request.tool, request.args, request.callId, openCodeConnectionName(context.sessionId))
    if (mapped.kind === 'refuse') {
      await recordToolCall(context, { toolName: request.tool, input: request.args, toolUseId: request.callId },
        { riskLevel: 'FLAGGED', blocked: true, blockReason: 'unknown-tool' })
      logger.warn(`[hitl] BLOCKED run=${context.runId} tool=${request.tool} (not a tool the gate knows)`)
      return { decision: 'refuse', message: mapped.reason }
    }
    const decision = await decideToolCall(context, mapped.call, { harnessPaths: openCodeHarnessPathPolicy(context, options) })
    if (!decision.allow) return { decision: 'refuse', message: decision.reason }
    const args = decision.realPaths ? mapped.withRealPaths(decision.realPaths) : null
    return args ? { decision: 'allow', args } : { decision: 'allow' }
  } catch (err) {
    logger.error(`[hitl] run=${context.runId} tool=${request.tool} — gate error, refused: ${err instanceof Error ? err.message : String(err)}`)
    return { decision: 'refuse', message: HARNESS_GATE_UNAVAILABLE }
  }
}
