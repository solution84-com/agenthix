// A command run on hq's machine (`agenthix hq <command>` in production), sent
// straight to hq's control socket as the host service sends it: one JSON line
// `{ command, args }`, answered by one JSON line (hq/src/auth/machine/controlSocket.ts).
import net from 'node:net'
import { HQ_CONTROL_SOCKET } from './env'

export type MachineCommandResult = { ok: boolean; text?: string; error?: string; code?: string; data?: unknown }

export function runHqMachineCommand(command: string, args: string[] = []): Promise<MachineCommandResult> {
  return new Promise((resolve, reject) => {
    const conn = net.connect(HQ_CONTROL_SOCKET)
    let reply = ''
    conn.setEncoding('utf8')
    conn.on('connect', () => conn.write(`${JSON.stringify({ command, args })}\n`))
    conn.on('data', chunk => {
      reply += chunk
    })
    conn.on('error', reject)
    conn.on('end', () => {
      try {
        resolve(JSON.parse(reply.trim()))
      } catch {
        reject(new Error(`hq's control socket answered something unreadable: ${reply}`))
      }
    })
  })
}
