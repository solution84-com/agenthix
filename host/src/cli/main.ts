/**
 * The CLI (host-management spec §6, §17): the same image's command, run inside the host service's container with
 * `docker exec -it agenthix-host <command> …`, talking to the owner socket. It holds no authority of its own: everything
 * it does, the host service does.
 */
import readline from 'node:readline'
import { HOST_SERVICE_VERSION, OWNER_SOCKET } from '../config'
import { ask } from '../sockets/lineServer'
import { parseCommand } from './commands'
import { runCommand, type Io } from './run'

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
  return {
    out: text => process.stdout.write(`${text}\n`),
    write: text => process.stdout.write(text),
    err: text => process.stderr.write(`${text}\n`),
    ask: prompt => {
      process.stdout.write(prompt)
      if (queue.length) return Promise.resolve(queue.shift()!)
      if (closed) return Promise.resolve(null)
      return new Promise(resolve => waiting.push(resolve))
    },
  }
}

const io = terminalIo()
const code = await runCommand(parseCommand(process.argv.slice(2)), (request, onProgress) => ask(OWNER_SOCKET, request, onProgress), io, HOST_SERVICE_VERSION)
process.exit(code)
