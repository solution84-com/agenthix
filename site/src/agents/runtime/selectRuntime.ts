import { ClaudeSDKRuntime } from './ClaudeSDKRuntime'
import { OpenCodeRuntime } from './OpenCodeRuntime'
import { scriptedRuntime } from '../../demo/runtime/ScriptedRuntime'
import { siteInDemoMode } from '../../demo/runtime/noContainers'
import { CLAUDE_SDK_RUNTIME, OPENCODE_RUNTIME, type AgentRuntime } from './types'

/**
 * The runtime a run uses, chosen by the name hq recorded for it (`Agent.runtime`
 * / `AgentSession.runtime`). An unknown name is an error, never a fall back to
 * Claude: a conversation keeps the runtime it started with (adr-0078), so
 * running it on another would silently change its harness and billing.
 *
 * In the demo (`DEMO_MODE`) every name gets the scripted runtime: no harness, no model, no container.
 */
export function selectRuntime(name: string): AgentRuntime {
  if (siteInDemoMode()) return scriptedRuntime
  switch (name) {
    case CLAUDE_SDK_RUNTIME:
      return new ClaudeSDKRuntime()
    case OPENCODE_RUNTIME:
      return new OpenCodeRuntime()
    default:
      throw new Error(`Unknown agent runtime '${name}'. This site runs '${CLAUDE_SDK_RUNTIME}' and '${OPENCODE_RUNTIME}'.`)
  }
}
