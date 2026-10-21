/**
 * Platform tools the site serves itself, for the turn the caller's token acts
 * for — not forwarded to hq, because what they touch is on this machine: the
 * conversation's own processes in its container, and the org's search key that
 * came with the turn. Each passes the per-call gate like every platform tool,
 * by its own name.
 *
 * - `stop_processes` (spec, "Keeping the gate whole" item 3): each command the
 *   agent runs is its own sandbox and cannot signal a process an earlier one
 *   started, so the site stops them for it — only the calling conversation's
 *   own, never the harness (conversationProcessStop.ts).
 * - `web_search` (spec, "Tool-name mapping"): on OpenCode only; Claude keeps
 *   its own. The site searches with the org's key, which never reaches the
 *   container (webSearch.ts).
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RunContext } from '../../agents/runtime/types'
import { STOP_PROCESSES_MATCH_MAX, stopConversationProcesses } from '../../agents/runtime/conversationProcessStop'
import { exaWebSearch, formatWebSearchResults, WebSearchError } from '../search/webSearch'
import type { WebSearchService } from '../search/webSearch'

export const STOP_PROCESSES_TOOL = 'stop_processes'
export const WEB_SEARCH_TOOL = 'web_search'

/**
 * The header a platform-tool connection sends to say which harness holds it,
 * so the site offers `web_search` to OpenCode's connections only. Not a
 * credential: the token decides everything else.
 */
export const PLATFORM_TOOLS_HARNESS_HEADER = 'x-agenthix-harness'
export const OPENCODE_HARNESS = 'opencode'

export interface SiteToolsOptions {
  /** The turn the caller's token acts for, or null when none is running. */
  context: RunContext | null
  /** Whether the connection is an OpenCode server's. */
  openCode: boolean
  webSearch?: WebSearchService
}

const text = (t: string, isError = false) => ({ content: [{ type: 'text' as const, text: t }], ...(isError ? { isError: true as const } : {}) })
const NO_TURN = 'No turn of this conversation is running, so nothing was done.'

export function registerSiteTools(server: McpServer, opts: SiteToolsOptions): void {
  const { context } = opts

  server.tool(
    STOP_PROCESSES_TOOL,
    'Stop processes that your earlier commands started and left running — a dev server, a watcher. A command cannot ' +
      'stop them itself: each command runs in its own sandbox. Stops only this conversation\'s own processes, with ' +
      'everything they started.',
    {
      match: z.string().max(STOP_PROCESSES_MATCH_MAX).optional()
        .describe('Text from the command line of the processes to stop, matched literally (for example "npm run dev"). Omit it to stop every process this conversation left running.'),
    },
    async ({ match }: { match?: string }) => {
      if (!context) return text(NO_TURN, true)
      if (!context.containerName) return text('This run has no container, so there are no processes to stop.', true)
      const result = await stopConversationProcesses(context.containerName, context.sessionId, match ?? '')
      if (result.kind === 'failed') return text(`The processes could not be stopped: ${result.error}`, true)
      const list = result.stopped.map(p => `${p.pid} ${p.command}`).join('\n')
      if (result.kind === 'gave-up') {
        return text(`Some processes kept starting new ones and are still running: ${result.remaining.join(' ')}${list ? `\nStopped:\n${list}` : ''}`, true)
      }
      return text(result.stopped.length ? `Stopped ${result.stopped.length}:\n${list}` : 'No process of this conversation matched.')
    },
  )

  if (!opts.openCode) return
  const webSearch = opts.webSearch ?? exaWebSearch()
  server.tool(
    WEB_SEARCH_TOOL,
    'Search the web. Returns the most relevant pages, each with its title, address and an excerpt of its text.',
    {
      query: z.string().min(1).max(500).describe('What to search for'),
      numResults: z.number().int().min(1).max(10).optional().describe('How many results to return (default 5)'),
    },
    async ({ query, numResults }: { query: string; numResults?: number }) => {
      if (!context) return text(NO_TURN, true)
      if (!context.webSearchKey) return text('Web search is not set up for this organisation: it has no search key.', true)
      try {
        const results = await webSearch.search({ query, numResults: numResults ?? 5 }, context.webSearchKey)
        return text(formatWebSearchResults(query, results))
      } catch (err) {
        return text(err instanceof WebSearchError ? err.message : 'The search failed.', true)
      }
    },
  )
}
