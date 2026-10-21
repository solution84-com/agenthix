/**
 * Claude's adapter onto the tool gate (toolGate.ts): the `PreToolUse` hook.
 *
 * It translates Claude's tool names (`Read`, `mcp__platform__create_task`) to
 * canonical ones, refuses what only Claude could ask for — another MCP server's
 * tools, the SDK's own meta-tools — and hands everything else to the shared
 * decision, with the paths Claude's own file tools will open and a short target
 * for a deferred request. What it answers is the SDK hook's shape: `{}` to
 * allow, `{ decision: 'block', reason }` to refuse with steering text. When a
 * file tool's path led through a link, the allow hands Claude the checked real
 * path through `updatedInput`, so a link swapped after the check is not
 * followed (spec, gate item 6).
 */
import type { HookInput, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk'
import os from 'node:os'
import path from 'node:path'
import { decideToolCall, recordToolCall } from './toolGate'
import type { GateCall } from './toolGate'
import { containerHarnessPathPolicy, hostHarnessPathPolicy } from './harnessPathRule'
import type { HarnessPathPolicy, HarnessRealPaths, RealPathResolver } from './harnessPathRule'
import { claudeProjectFolderName } from './claudeSessionFile'
import { BRANDING } from '@agenthix/core'
import { fromSdkToolName, MCP_SERVER_NAME, SKILL_TOOL, SKILLS_PLUGIN_NAME } from './sdkNames'
import type { RunContext } from './types'
import { Logger } from '../../server/utils/logger'

const logger = new Logger('ClaudeSDKRuntime')

/** SDK meta-tools that bypass allowedTools — never valid in agent runs. */
const SDK_META_TOOLS = new Set(['ToolSearch', 'TaskOutput', 'TaskStop'])

/**
 * Tools every agent has, each call still logged: Claude's own to-do list — the
 * agent's private checklist for the conversation, not a platform task (spec,
 * "Tool-name mapping") — and `skill`, which loads one of the turn's staged skills.
 */
const PERMISSION_FREE_TOOLS = new Set(['TodoWrite', 'TodoRead', SKILL_TOOL])

/**
 * The staged skill a Skill call names, as the process was started with it: a
 * leading `/` and the plugin's `agenthix:` prefix are what Claude Code accepts
 * besides the bare name.
 */
function skillCalled(inp: Input): string {
  const name = (str(inp.skill) ?? '').trim().replace(/^\//, '')
  return name.startsWith(`${SKILLS_PLUGIN_NAME}:`) ? name.slice(SKILLS_PLUGIN_NAME.length + 1) : name
}

type Input = Record<string, unknown>
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)

/** Extracts a short target string from a tool call for deferred approval display. */
function deferredTarget(toolName: string, inp: Input): string | null {
  switch (toolName) {
    case 'write_file':
    case 'edit_file':
    case 'read_file': {
      const p = str(inp.file_path)
      return p ? path.basename(p) : null
    }
    case 'glob_files':
    case 'grep_files': return str(inp.pattern) ?? null
    case 'web_fetch':  return str(inp.url) ?? null
    case 'web_search': return str(inp.query) ?? null
    default: return null
  }
}

/** The paths Claude's own file tools will use, as the gate's path rule reads them. */
export function claudeFileToolPaths(toolName: string, inp: Input): string[] | undefined {
  switch (toolName) {
    case 'read_file':
    case 'write_file':
    case 'edit_file': return [str(inp.file_path) ?? '.']
    case 'grep_files': return [str(inp.path) ?? '.']
    case 'glob_files': {
      const base = str(inp.path) ?? '.'
      const pattern = str(inp.pattern)
      if (!pattern) return [base]
      return [base, pattern.startsWith('/') ? pattern : `${base.replace(/\/+$/, '')}/${pattern}`]
    }
    default: return undefined
  }
}

/**
 * The call's input with each checked path Claude's file tool will open
 * replaced by where it really leads, or null when none leads elsewhere. A glob
 * pattern is left as the model gave it: its folder is the `path` argument.
 */
export function claudeInputWithRealPaths(toolName: string, inp: Input, realPaths: HarnessRealPaths): Input | null {
  const key = toolName === 'read_file' || toolName === 'write_file' || toolName === 'edit_file' ? 'file_path'
    : toolName === 'grep_files' || toolName === 'glob_files' ? 'path'
    : null
  const given = key ? str(inp[key]) : undefined
  const real = given !== undefined ? realPaths[given] : undefined
  return key && real !== undefined ? { ...inp, [key]: real } : null
}

export interface ClaudeGateOptions {
  /** The run's staged skills folder as the harness sees it, which its read-only tools may read. */
  skillsDir?: string | null
  /** The staged skills' names: a Skill call naming any other is refused. */
  skillNames?: readonly string[]
  /** Overrides how paths are resolved (tests). */
  resolveRealPath?: RealPathResolver
}

/**
 * Where Claude's file tools may not go. In a container: the image user's home
 * and `/proc`. On this machine: the runner's harness home, the process's own
 * Claude config folder, and `/proc`. Readable inside them: the run's staged
 * skills, and the folder Claude Code saves this session's large tool results
 * to and then tells the model to read.
 */
export function claudeHarnessPathPolicy(context: RunContext, options: ClaudeGateOptions = {}): HarnessPathPolicy {
  const sdkSessionId = context.sessionId
  const configDir = context.containerName
    ? context.claudeHome.visibleDir
    : (process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude'))
  const toolResults = path.posix.join(configDir, 'projects', claudeProjectFolderName(context.cwd), sdkSessionId, 'tool-results')
  const readable = [...(options.skillsDir ? [options.skillsDir] : []), toolResults]
  if (context.containerName) {
    return containerHarnessPathPolicy(context.containerName, context.cwd, readable, options.resolveRealPath)
  }
  const homes = [path.posix.dirname(context.claudeHome.visibleDir), configDir]
  return hostHarnessPathPolicy(context.cwd, homes, readable, options.resolveRealPath)
}

export function buildPreToolUseHook(
  context: RunContext,
  options: ClaudeGateOptions = {},
): (input: HookInput) => Promise<Record<string, unknown>> {
  const harnessPaths = claudeHarnessPathPolicy(context, options)
  return async (input: HookInput) => {
    const { tool_name: sdkToolName, tool_input: toolInput, tool_use_id: toolUseId } = input as PreToolUseHookInput

    // Claude's mcp__<server>__<tool> and Read/Bash names to canonical ones; anything else as-is.
    const toolName = fromSdkToolName(sdkToolName) ?? sdkToolName

    // External MCPs (Atlassian, Supabase, etc.) are injected by the Claude
    // environment but are not part of the Agenthix permission model.
    const platformPrefix = `mcp__${MCP_SERVER_NAME}__`
    if (sdkToolName.startsWith('mcp__') && !sdkToolName.startsWith(platformPrefix)) {
      logger.warn(`[hitl] BLOCKED run=${context.runId} tool=${sdkToolName} (external MCP — not in platform)`)
      return { decision: 'block', reason: `External MCP tool ${sdkToolName} is not available. Only ${BRANDING.displayName} platform tools are permitted.` }
    }

    if (SDK_META_TOOLS.has(toolName)) {
      await recordToolCall(context, { toolName, input: toolInput, toolUseId }, { riskLevel: 'FLAGGED', blocked: true, blockReason: 'sdk-meta-tool-blocked' })
      logger.warn(`[hitl] BLOCKED run=${context.runId} tool=${toolName} (sdk meta-tool)`)
      return { decision: 'block', reason: `${toolName} is not available in ${BRANDING.displayName} agent runs. Use the platform MCP tools (e.g. create_task) to manage tasks.` }
    }

    const inp = (toolInput ?? {}) as Input
    // Claude Code's allowlist already refuses these; checked again here.
    if (toolName === SKILL_TOOL && !(options.skillNames ?? []).includes(skillCalled(inp))) {
      await recordToolCall(context, { toolName, input: toolInput, toolUseId }, { riskLevel: 'FLAGGED', blocked: true, blockReason: 'skill-not-staged' })
      logger.warn(`[hitl] BLOCKED run=${context.runId} tool=skill name=${skillCalled(inp).slice(0, 80)} (not staged)`)
      return { decision: 'block', reason: `There is no skill named "${skillCalled(inp)}" in this run. Use only the skills listed for it.` }
    }

    const call: GateCall = {
      toolName,
      input: toolInput,
      toolUseId,
      target: deferredTarget(toolName, inp),
      paths: claudeFileToolPaths(toolName, inp),
      permissionFree: PERMISSION_FREE_TOOLS.has(toolName),
    }
    const decision = await decideToolCall(context, call, { harnessPaths })
    if (!decision.allow) return { decision: 'block', reason: decision.reason }
    const updatedInput = decision.realPaths ? claudeInputWithRealPaths(toolName, inp, decision.realPaths) : null
    return updatedInput
      ? { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput } }
      : {}
  }
}
