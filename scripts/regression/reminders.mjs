// The lines a regression starts its output with when the repository says something is due: the monthly dependency
// updates (scripts/deps/due.mjs) and the security alerts (scripts/deps/security.mjs). Each answers `--line` with one
// plain line when something needs attention and nothing otherwise. A reminder never fails or holds up a run: a script
// that is missing, fails or takes too long says nothing.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const REMINDERS = ['scripts/deps/due.mjs', 'scripts/deps/security.mjs']

const ask = (root, script) => execFileSync(process.execPath, [script, '--line'],
  { cwd: root, encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'ignore'] })

/** The reminders' lines, in order. `run(root, script)` returns a script's output (the real one unless given). */
export function reminderLines({ root, run = ask }) {
  const lines = []
  for (const script of REMINDERS) {
    if (!existsSync(join(root, script))) continue
    try {
      lines.push(...String(run(root, script)).split('\n').map((l) => l.trim()).filter(Boolean))
    } catch { /* a reminder says nothing rather than fail the run */ }
  }
  return lines
}
