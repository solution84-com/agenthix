import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { SITE_ROOT, SITE_ROOT_DIR } from './env'

export interface SiteCommandResult {
  code: number
  stdout: string
  stderr: string
}

/**
 * A still-pending `runSiteCommand()` call. Killing the command closes its
 * control-socket connection, and the site aborts whatever that connection
 * started — for `register`, the site-side approval poll stops with it rather
 * than outliving the command. `kill()` is a no-op once the
 * child has already exited (checked via `exitCode`/`signalCode`, not a
 * local flag, so it stays correct even if called more than once or after
 * the promise has already settled) — callers can call it unconditionally
 * from a `finally` without worrying about the happy path where the child
 * already exited on its own.
 */
export interface SiteCommandHandle extends Promise<SiteCommandResult> {
  kill(): void
}

/** Runs the site's real command against the site this tier booted. */
export function runSiteCommand(args: string[], onLine?: (line: string) => void): SiteCommandHandle {
  const child = spawn(process.execPath, [join(SITE_ROOT, 'scripts', 'agenthix-site.mjs'), ...args], {
    cwd: SITE_ROOT_DIR,
    env: { ...process.env, SITE_ROOT: SITE_ROOT_DIR },
  })
  const promise = new Promise<SiteCommandResult>((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    // Carry-over buffer: a chunk boundary can land mid-line (e.g. splitting
    // "enter the code:  XXXX-XXXX" across two 'data' events), so only lines
    // already terminated by '\n' are emitted as they arrive — the trailing,
    // possibly-incomplete piece is held over and prefixed onto the next
    // chunk. Whatever is left with no more data coming (no final '\n') is
    // flushed once on 'close'.
    let carry = ''
    child.stdout.on('data', d => {
      const text = d.toString()
      stdout += text
      if (!onLine) return
      carry += text
      const lines = carry.split('\n')
      carry = lines.pop() ?? ''
      for (const line of lines) if (line.trim()) onLine(line)
    })
    child.stderr.on('data', d => { stderr += d.toString() })
    child.on('error', reject)
    child.on('close', code => {
      if (onLine && carry.trim()) onLine(carry)
      resolve({ code: code ?? -1, stdout, stderr })
    })
  }) as SiteCommandHandle
  promise.kill = () => {
    if (child.exitCode === null && child.signalCode === null) child.kill()
  }
  return promise
}
