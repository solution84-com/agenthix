/**
 * Asking the Fleet Console on this machine for remote access (console/src/net/remoteAccess.ts), through its command
 * line in its container: `docker exec` on the machine's authority, as for its other commands. The request goes on
 * standard input, never in the arguments, since an authenticator's secret is among what it carries. Nothing here is
 * logged.
 */
import { Refusal } from '../owner/results'
import { consoleHere } from '../install/console'
import type { Context } from '../service/context'

export type ConsoleRemoteCommand = 'remote-csr' | 'remote-on' | 'remote-off' | 'remote-status' | 'remote-authenticator-add' | 'remote-authenticator-reset'

export const consoleRemoteCommand = (command: ConsoleRemoteCommand) => ['node', '/app/dist/cli.js', command]

const lastLine = (text: string) => text.trim().split('\n').pop() ?? ''

/** The Fleet Console's answer, or a refusal in its own words. */
export async function askConsoleRemote(ctx: Context, command: ConsoleRemoteCommand, payload: object): Promise<Record<string, unknown>> {
  if (!consoleHere(ctx)) throw new Refusal('not_installed', `No Fleet Console runs on ${ctx.machine.name}.`)
  const r = await ctx.docker.exec(ctx.names.consoleContainer, consoleRemoteCommand(command), JSON.stringify(payload), 30_000)
  if (r.code !== 0) {
    let said = ''
    try {
      const e = JSON.parse(lastLine(r.stderr)) as { error?: unknown }
      if (typeof e.error === 'string') said = e.error.slice(0, 300)
    } catch { /* not its JSON: it is not answering */ }
    throw said
      ? new Refusal('conflict', `The Fleet Console on ${ctx.machine.name} refused: ${said}`)
      : new Refusal('failed', `The Fleet Console on ${ctx.machine.name} is not answering.`)
  }
  try {
    const answer = JSON.parse(lastLine(r.stdout)) as unknown
    if (answer && typeof answer === 'object' && !Array.isArray(answer)) return answer as Record<string, unknown>
  } catch { /* falls through */ }
  throw new Refusal('failed', `The Fleet Console on ${ctx.machine.name} gave no answer.`)
}
