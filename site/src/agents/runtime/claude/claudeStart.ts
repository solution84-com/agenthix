/**
 * What a `claude` process is started with, built for one turn (spec §1).
 *
 * The tool list, blocked tools, system prompt, skills, platform-tool
 * connection and credential are read by the CLI when it starts and fixed for
 * its life. So each turn builds them afresh, and `fingerprint` says whether
 * they still match the running process: when they do not, the process is
 * replaced and the new one resumes the conversation. The model is not part of
 * it — it is set per turn with `setModel()` — and neither is how the session
 * is opened.
 */
import { createHash } from 'node:crypto'
import { HARNESS_ENV, buildSdkBuiltinTools, buildSdkDisallowedTools } from '../sdkNames'
import { CLAUDE_COMMAND_SHELL_PREFIX, COMMAND_READABLE_ENV } from '../agentImage'
import { conversationProcessTag } from '../conversationProcesses'
import { HARNESS_SERVER_KEY_ENV } from '@agenthix/core'
import { getAgentFacingSiteUrl } from '../../../server/siteConfig'
import { CLAUDE_KEY_PATH } from '../../../server/runtime/claudeKeyTickets'
import { relayProviderUrl } from '../../../server/modelRelay/relayProviders'
import { isRelayed } from '../../../server/modelRelay/runAccess'
import type { RunContext } from '../types'
import type { StagedTurnSkills } from './claudeSkills'

export type ClaudeStart = {
  fingerprint: string
  /** The query's options, less the per-process parts (hooks, spawning, stderr, session). */
  options: Record<string, unknown>
  /** Given to the `claude` process's own `docker exec`, by name, in a container. */
  execEnv: Record<string, string>
  /**
   * Whether the process's model requests go through the site's model relay:
   * an API key or Agenthix Cloud, in a container (spec §6). The process is given a one-use
   * ticket at start (claudeKeyTickets.ts), which its `apiKeyHelper` trades
   * for a relay token; the key itself never enters the container. A
   * subscription is never relayed: Anthropic's terms forbid a relay holding
   * its credential, so it stays in the client.
   */
  relayed: boolean
}

/**
 * How long the CLI keeps what its `apiKeyHelper` printed before running it
 * again: past any process's life (the idle timer ends it long before), so the
 * helper runs once, at start. The largest delay a timer can hold.
 */
export const API_KEY_HELPER_TTL_MS = 2_147_483_647

export function buildClaudeStart(context: RunContext, skills: StagedTurnSkills | null): ClaudeStart {
  const tools = buildSdkBuiltinTools(context)
  const disallowedTools = buildSdkDisallowedTools(context)
  const systemPrompt = context.agent.systemPrompt ?? undefined
  const apiKey = context.credential?.kind === 'apiKey' ? context.credential.apiKey : null
  // An API key or Agenthix Cloud: the relay presents it, so the process holds neither.
  const relayed = !!context.containerName && isRelayed(context.credential)
  const execEnv = context.containerName ? claudeExecEnv(context, skills, relayed) : {}

  const options: Record<string, unknown> = {
    cwd: context.cwd,
    pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_PATH ?? 'claude',
    // In a container only the exec's own variables reach the harness
    // (DockerSpawner); without one it inherits this process's environment,
    // and the run's key.
    env: { ...process.env, ...HARNESS_ENV, ...(!context.containerName && apiKey ? { ANTHROPIC_API_KEY: apiKey } : {}) },
    systemPrompt,
    // The run-visible skills folder, named explicitly so Claude Code trusts it.
    ...(skills ? { additionalDirectories: [skills.visibleDir] } : {}),
    // The turn's skills, as a local plugin (claudeSkills.ts), and only those:
    // the allowlist hides Claude Code's own bundled skills from the list and
    // the Skill tool.
    ...(skills ? { plugins: [{ type: 'local', path: skills.visiblePluginDir }] } : {}),
    skills: skills?.names ?? [],
    permissionMode: 'bypassPermissions',
    // Which built-ins Claude can see; see buildSdkBuiltinTools for why
    // never-state tools must not prune the bypassed set.
    tools,
    // Always-blocked meta tools and the platform tools this run may not call.
    disallowedTools,
    includePartialMessages: true,
    settingSources: [],  // no settings files: prompt, tools and MCP servers are all set here
    // A skill's inline `!` commands would run outside the tool gate.
    settings: { autoMemoryEnabled: false, disableSkillShellExecution: true, ...(relayed ? { apiKeyHelper: apiKeyHelperCommand() } : {}) },
    ...(context.mcpServers ? { mcpServers: context.mcpServers } : {}),
  }

  const fingerprint = createHash('sha256').update(JSON.stringify({
    cwd: context.cwd,
    container: context.containerName ?? null,
    home: context.claudeHome.visibleDir,
    tools,
    disallowedTools,
    systemPrompt: systemPrompt ?? null,
    skills: skills?.hash ?? null,
    mcpServers: context.mcpServers ?? null,
    // The skills folder is compared by content, above, and the key by its hash.
    execEnv: Object.fromEntries(Object.entries(execEnv).filter(([k]) => k !== COMMAND_READABLE_ENV)),
    credential: credentialIdentity(context),
  })).digest('hex')

  return { fingerprint, options, execEnv, relayed }
}

/**
 * Claude Code's `apiKeyHelper`: trades the process's ticket at the site for
 * its relay token, which Claude Code then sends as its key, to the relay
 * (`ANTHROPIC_BASE_URL`). Claude Code runs it itself with `/bin/sh -c`, as the harness and
 * with its environment — not through `CLAUDE_CODE_SHELL_PREFIX` — so it reads
 * the ticket that the command launcher removes from every agent command.
 * Nothing secret is in the command itself, which is on the CLI's command line.
 */
export function apiKeyHelperCommand(siteUrl: string = getAgentFacingSiteUrl()): string {
  const url = `${siteUrl}${CLAUDE_KEY_PATH}`.replace(/'/g, `'\\''`)
  return `curl -fsS --max-time 10 -X POST -H "Authorization: Bearer $${HARNESS_SERVER_KEY_ENV}" '${url}'`
}

/**
 * The `claude` process's own environment in a container, given on its
 * `docker exec` — nothing of it is the container's (spec §1, §3, "Keeping the
 * gate whole" item 3):
 *
 * - the conversation's tag, which everything the process starts inherits, so
 *   the conversation's processes — this one included — end with it;
 * - `CLAUDE_CODE_SHELL_PREFIX`, so every command the agent runs goes through
 *   the image's Landlock launcher, which cannot reach this process and removes
 *   its secrets from the command's environment;
 * - `USE_BUILTIN_RIPGREP=0`, so Grep and Glob run the `rg` on the image's
 *   `PATH` (`/usr/local/bin/rg`), which runs the real one through the
 *   same launcher, instead of the copy built into the CLI, which runs with
 *   this process's own reach — so a link swapped in after the gate's check
 *   leads nowhere (spec, "Tools Agenthix owns on OpenCode", on Claude);
 * - the staged skills folder as one commands may read, so a skill's scripts
 *   run although the folder is inside the harness home, and Grep may search it;
 * - the git credential helper's endpoint and token;
 * - for an API key, the site's model relay as Anthropic's address — Anthropic's
 *   documented gateway pattern — and the helper's cache lifetime; the ticket
 *   it trades for a relay token is added when the process starts. The key is
 *   never in the container at all: the relay adds it to each request (spec §6).
 */
function claudeExecEnv(context: RunContext, skills: StagedTurnSkills | null, relayed: boolean): Record<string, string> {
  return {
    ...context.gitCredEnv,
    ...HARNESS_ENV,
    ...conversationProcessTag(context.sessionId),
    CLAUDE_CODE_SHELL_PREFIX: CLAUDE_COMMAND_SHELL_PREFIX,
    USE_BUILTIN_RIPGREP: '0',
    ...(skills ? { [COMMAND_READABLE_ENV]: skills.visibleDir } : {}),
    ...(relayed ? {
      // Claude Code appends /v1/messages itself.
      ANTHROPIC_BASE_URL: relayProviderUrl(getAgentFacingSiteUrl(), 'anthropic'),
      CLAUDE_CODE_API_KEY_HELPER_TTL_MS: String(API_KEY_HELPER_TTL_MS),
    } : {}),
  }
}

/**
 * How the process authenticates. Not which key: an API key stays on the site,
 * and the relay adds the current turn's to each request, so a changed key
 * needs no new process.
 */
function credentialIdentity(context: RunContext): string {
  const credential = context.credential
  if (!credential) return 'none'
  return credential.kind
}
