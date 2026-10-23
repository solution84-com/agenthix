/**
 * hq's control socket from the host service: a secret argument, such as a provider's key, goes inside the program
 * piped to hq-server, never on any command line, and still reaches hq as the request's arguments.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Docker } from '../../docker/docker'
import { HqControl } from '../control'

const KEY = 'sk-test-fake-0000000000a3f9'
const folders: string[] = []
afterEach(() => { for (const f of folders.splice(0)) fs.rmSync(f, { recursive: true, force: true }) })

type Exec = { command: string[]; input: string }

/** Docker's exec as hq-server would run it: the command and the piped program, run by Node here, at a socket of ours. */
async function throughSocket(run: (control: HqControl) => Promise<unknown>): Promise<{ execs: Exec[]; received: unknown[]; answer: unknown }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hqctl-'))
  folders.push(dir)
  const socket = path.join(dir, 'c.sock')
  const received: unknown[] = []
  const server = net.createServer(conn => {
    conn.setEncoding('utf8')
    let buf = ''
    conn.on('data', (d: string) => {
      buf += d
      if (!buf.includes('\n')) return
      received.push(JSON.parse(buf.trim()))
      conn.end(`${JSON.stringify({ ok: true, text: 'Added.' })}\n`)
    })
  })
  await new Promise<void>(r => server.listen(socket, r))
  const execs: Exec[] = []
  const docker = {
    exec: async (_container: string, command: string[], input: string) => {
      execs.push({ command, input })
      const child = spawn(command[0], command.slice(1), { env: { ...process.env, HQ_CONTROL_SOCKET: socket } })
      let stdout = ''
      child.stdout.setEncoding('utf8').on('data', (d: string) => { stdout += d })
      child.stdin.end(input)
      const code = await new Promise<number>(r => child.on('close', c => r(c ?? 1)))
      return { code, stdout, stderr: '' }
    },
  } as unknown as Docker
  try {
    const answer = await run(new HqControl(docker, 'hq-server'))
    return { execs, received, answer }
  } finally {
    server.close()
  }
}

describe('HqControl', () => {
  it('sends a provider key inside the piped program, never on the command line', async () => {
    const { execs, received, answer } = await throughSocket(c => c.providerAdd({ vendor: 'anthropic', key: KEY }))
    expect(answer).toEqual({ ok: true, text: 'Added.' })
    expect(received).toEqual([{ command: 'provider', args: ['add', 'anthropic', KEY, '', ''] }])
    expect(execs[0].command.join(' ')).not.toContain(KEY)
    expect(execs[0].command).toEqual(['node', '--input-type=module', '-', 'provider'])
  })

  it('a command without a secret still takes its arguments from its command line', async () => {
    const { received } = await throughSocket(c => c.providerRemove('openai'))
    expect(received).toEqual([{ command: 'provider', args: ['remove', 'openai'] }])
  })
})
