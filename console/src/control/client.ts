/** The control socket's client, for the command line inside the console's container (cli.ts). */
import net from 'node:net'
import type { ControlAnswer } from './socket'

/** The answer to one command, without its `ok`; rejects with the server's own words when it refuses. */
export function requestControl(socketPath: string, command: string, extra: { address?: string; payload?: Record<string, unknown> } = {}): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(socketPath)
    let text = ''
    socket.setEncoding('utf8')
    socket.setTimeout(30_000, () => socket.destroy(new Error('The Fleet Console did not answer.')))
    socket.on('connect', () => socket.write(`${JSON.stringify({ command, ...extra })}\n`))
    socket.on('data', chunk => { text += chunk })
    socket.on('error', reject)
    socket.on('end', () => {
      try {
        const a = JSON.parse(text) as ControlAnswer
        if (!a.ok) return reject(new Error(a.error))
        const { ok: _ok, ...data } = a
        resolve(data)
      } catch {
        reject(new Error('The Fleet Console gave no answer.'))
      }
    })
  })
}

export async function requestLocalJoin(socketPath: string, command = 'local-join'): Promise<{ code: string }> {
  const a = await requestControl(socketPath, command)
  if (typeof a.code !== 'string') throw new Error('The Fleet Console gave no code.')
  return { code: a.code }
}
