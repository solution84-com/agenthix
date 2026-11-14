/**
 * What a run is told of web search when it has none (what agents can do, walkthrough finding W2): withheld by the
 * agent's own tools — Search the web at Never, or at Ask in a run nobody can approve, as the gate refuses it
 * (toolGate.ts) and the harness hides it (builtinWithheld, unattendedAskTools) — or, on OpenCode only, the
 * organisation's missing search key. The agent's tools come first: with them withholding it, a key would not help.
 */
import { NO_WEB_SEARCH_INSTRUCTIONS, webSearchWithheldInstructions, type WebSearchWithheld } from '@agenthix/core'
import { RUNTIME_TOOLS } from '../../shared/runtimeTools'
import { getToolState, runIsUnattended } from './toolPermissions'
import type { RunContext } from './types'

type SearchContext = Pick<RunContext, 'bypassed' | 'allowedTools' | 'approvedManifest' | 'webSearchKey'>

export function webSearchWithheldBy(context: SearchContext): WebSearchWithheld | null {
  if (context.bypassed || !context.allowedTools) return null
  const state = getToolState(RUNTIME_TOOLS.WEB.WEB_SEARCH, context.allowedTools)
  if (state === 'never') return 'never'
  return state === 'ask' && runIsUnattended(context) ? 'unattended' : null
}

/** The instructions a run is given about web search, or null when it can search. */
export function webSearchInstructions(context: SearchContext, runtime: 'claude' | 'opencode'): string | null {
  const withheld = webSearchWithheldBy(context)
  if (withheld) return webSearchWithheldInstructions(withheld)
  return runtime === 'opencode' && !context.webSearchKey ? NO_WEB_SEARCH_INSTRUCTIONS : null
}
