/**
 * The live `claude` processes, one per conversation (spec §1), for this site
 * process's life: a site restart ends the `docker exec` holding each, and the
 * next turn starts a new one that resumes.
 *
 * Module-level rather than per runtime object: a runtime is chosen per run,
 * and a conversation's idle and end reach whichever one is asked.
 */
import type { ClaudeProcess } from './claudeProcess'

const processes = new Map<string, ClaudeProcess>()

export function claudeProcessFor(conversationId: string): ClaudeProcess | undefined {
  return processes.get(conversationId)
}

export function keepClaudeProcess(process: ClaudeProcess): void {
  processes.set(process.conversationId, process)
}

/** Closes the conversation's process, if it has one. Never rejects. */
export async function closeClaudeProcess(conversationId: string): Promise<void> {
  const process = processes.get(conversationId)
  if (!process) return
  processes.delete(conversationId)
  await process.close()
}

/** How many conversations hold a process now (tests, diagnostics). */
export function liveClaudeProcessCount(): number {
  return processes.size
}
