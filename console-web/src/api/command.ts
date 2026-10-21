import type { HostRequest, HostResult } from '@agenthix/core'
import { api } from './client'

type CommandAnswer = { command: { id: string; state: 'pending' | 'done' | 'failed'; result: HostResult | null; problem: string | null } }

export type CommandOutcome = { ok: true; result: HostResult & { ok: true } } | { ok: false; message: string }

const outcomeOf = (answer: CommandAnswer['command']): CommandOutcome => {
  if (answer.state === 'failed') return { ok: false, message: answer.problem ?? 'The command failed.' }
  const r = answer.result
  if (r?.ok) return { ok: true, result: r }
  return { ok: false, message: r && !r.ok ? r.refusal.message : 'The machine gave no answer.' }
}

/**
 * Sends a request to a machine through the command route and follows it until it ends. `stillWanted` lets a screen
 * that went away stop the following; the outcome is then null.
 */
export function runCommand(
  fingerprint: string, request: HostRequest, pollMs = 1500, stillWanted: () => boolean = () => true,
): Promise<CommandOutcome | null> {
  return postAndFollow(`/hosts/${fingerprint}/commands`, { request }, pollMs, stillWanted)
}

/** Posts to a route that answers with a command (the command route, or *Restore…*'s), and follows it until it ends. */
export async function postAndFollow(
  path: string, body: unknown, pollMs = 1500, stillWanted: () => boolean = () => true,
): Promise<CommandOutcome | null> {
  try {
    let { command } = await api<CommandAnswer>(path, { method: 'POST', body })
    while (command.state === 'pending') {
      await new Promise(resolve => setTimeout(resolve, pollMs))
      if (!stillWanted()) return null
      command = (await api<CommandAnswer>(`/commands/${command.id}`)).command
    }
    return stillWanted() ? outcomeOf(command) : null
  } catch (err) {
    return stillWanted() ? { ok: false, message: err instanceof Error ? err.message : String(err) } : null
  }
}
