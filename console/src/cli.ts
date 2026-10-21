/**
 * The console image's command line, run by the host service with `docker exec` on the machine's authority. Each
 * prints one JSON line (control/socket.ts says what each answers):
 *   node dist/cli.js local-join        → {"code":"…"}, for joining hq's own machine at install
 *   node dist/cli.js handover-code     → {"code":"…","expiresAt":"…"}, to move this Fleet Console elsewhere
 *   node dist/cli.js handover-status   → {"state":"…", …, "hq":"…"}, whether this one took another's place, and HQ lets it in
 *   node dist/cli.js hq-address <a>    → {"address":"…","outcome":"…"}, hq moved: dial it once it passes the check
 *   node dist/cli.js remote-<what>     → remote access on a machine Cloud runs; its request is one JSON object on
 *                                        standard input, since it can hold a secret
 * It speaks to the running server through the control socket in the state folder.
 */
import { requestControl } from './control/client'
import { controlSocketPath } from './config'

const COMMANDS = ['local-join', 'handover-code', 'handover-status', 'hq-address']
const REMOTE = ['remote-csr', 'remote-on', 'remote-off', 'remote-status', 'remote-authenticator-add', 'remote-authenticator-reset']
const MAX_INPUT = 64 * 1024

async function readInput(): Promise<Record<string, unknown>> {
  let text = ''
  for await (const chunk of process.stdin) {
    text += String(chunk)
    if (text.length > MAX_INPUT) throw new Error('The request is too large.')
  }
  const value: unknown = text.trim() ? JSON.parse(text) : {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The request is not a JSON object.')
  return value as Record<string, unknown>
}

const [command, address] = process.argv.slice(2)
const remote = REMOTE.includes(command)
if (!(COMMANDS.includes(command) || remote) || (command === 'hq-address') !== (address !== undefined)) {
  process.stderr.write(`Usage: node dist/cli.js ${[...COMMANDS, ...REMOTE].join('|')}\n`)
  process.exit(2)
}
const extra = async () => remote ? { payload: await readInput() } : address === undefined ? {} : { address }
extra()
  .then(e => requestControl(controlSocketPath(process.env), command, e))
  .then(answer => process.stdout.write(`${JSON.stringify(answer)}\n`))
  .catch(err => {
    process.stderr.write(`${JSON.stringify({ error: err instanceof Error ? err.message : String(err) })}\n`)
    process.exit(1)
  })
