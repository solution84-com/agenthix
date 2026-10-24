/**
 * The CLI (host-management spec §6, §17): the same image's command, run inside the host service's container with
 * `docker exec -it agenthix-host <command> …`, talking to the owner socket. It holds no authority of its own: everything
 * it does, the host service does.
 */
import readline from 'node:readline'
import { OWNER_SOCKET } from '../config'
import { ask } from '../sockets/lineServer'
import { parseCommand } from './commands'
import { runCommand, type Io } from './run'

/** A line typed in raw mode, as the person meant it: backspaces applied; Ctrl-C ends the command. */
function unseen(line: string): string {
  let out = ''
  for (const ch of line) {
    if (ch === '\u0003') process.exit(130)
    if (ch === '\u007f' || ch === '\b') out = out.slice(0, -1)
    else if (ch >= ' ') out += ch
  }
  return out
}

function terminalIo(): Io {
  const lines = readline.createInterface({ input: process.stdin, terminal: false })
  const queue: string[] = []
  const waiting: ((line: string | null) => void)[] = []
  let closed = false
  lines.on('line', line => (waiting.length ? waiting.shift()!(line) : queue.push(line)))
  lines.on('close', () => {
    closed = true
    while (waiting.length) waiting.shift()!(null)
  })
  const next = (prompt: string): Promise<string | null> => {
    process.stdout.write(prompt)
    if (queue.length) return Promise.resolve(queue.shift()!)
    if (closed) return Promise.resolve(null)
    return new Promise(resolve => waiting.push(resolve))
  }
  return {
    out: text => process.stdout.write(`${text}\n`),
    write: text => process.stdout.write(text),
    err: text => process.stderr.write(`${text}\n`),
    ask: next,
    // In a terminal, raw mode stops it echoing what is typed; the line then arrives with its corrections unapplied.
    secret: async prompt => {
      const tty = process.stdin.isTTY === true
      if (tty) process.stdin.setRawMode(true)
      try {
        const line = await next(prompt)
        return line === null ? null : unseen(line)
      } finally {
        if (tty) {
          process.stdin.setRawMode(false)
          process.stdout.write('\n')
        }
      }
    },
  }
}

/** The host service's version, which it learnt at start; only `help` shows it, and shows none when it does not answer. */
async function serviceVersion(): Promise<string | null> {
  try {
    const reply = await ask(OWNER_SOCKET, { op: 'host.version' })
    const version = (reply.result as { version?: unknown } | undefined)?.version
    return reply.ok === true && typeof version === 'string' ? version : null
  } catch {
    return null
  }
}

const io = terminalIo()
const command = parseCommand(process.argv.slice(2))
const version = command.kind === 'help' ? await serviceVersion() : null
const code = await runCommand(command, (request, onProgress) => ask(OWNER_SOCKET, request, onProgress), io, version)
process.exit(code)
