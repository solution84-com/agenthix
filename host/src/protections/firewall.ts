/**
 * How the host service changes the machine's firewall: the `nft` command, run with an argument list it builds
 * itself and never through a shell, as Docker is driven (docker/docker.ts). The host service's container shares the
 * machine's network (`--network host`) and holds `NET_ADMIN`, so what it applies is the machine's own firewall —
 * on Docker Desktop, the virtual machine's, where the containers run.
 */
import { spawn } from 'node:child_process'
import type { RunResult } from '../docker/docker'

export type NftRunner = (args: string[], input?: string) => Promise<RunResult>

const TIMEOUT_MS = 30_000
const MAX_OUTPUT = 1024 * 1024

export const commandRunner = (command: string): NftRunner => (args, input) =>
  new Promise(resolve => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (c: Buffer) => { if (stdout.length < MAX_OUTPUT) stdout += c.toString('utf8') })
    child.stderr.on('data', (c: Buffer) => { if (stderr.length < MAX_OUTPUT) stderr += c.toString('utf8') })
    const timer = setTimeout(() => child.kill('SIGTERM'), TIMEOUT_MS)
    child.on('error', err => {
      clearTimeout(timer)
      resolve({ code: 127, stdout, stderr: stderr || err.message })
    })
    child.on('close', code => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr })
    })
    // A command that exits before reading all of it (nft without NET_ADMIN) breaks the pipe; `close` reports the failure.
    child.stdin.on('error', () => {})
    child.stdin.end(input ?? '')
  })

export const nftCli: NftRunner = commandRunner('nft')

export class Firewall {
  constructor(private readonly run: NftRunner) {}

  /** Applies a whole script in one transaction: all of it, or none. */
  apply(script: string): Promise<RunResult> {
    return this.run(['-f', '-'], script)
  }

  list(table: string): Promise<RunResult> {
    return this.run(['-j', 'list', 'table', 'inet', table])
  }

  delete(table: string): Promise<RunResult> {
    return this.run(['delete', 'table', 'inet', table])
  }
}
