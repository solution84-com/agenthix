import type { test as base } from '@playwright/test'

/**
 * What a spec does when the seed variable it needs is missing. By default it skips, so a spec can be run against any
 * development database. The full regression runs every seed first and sets `E2E_REQUIRE_SEEDED=1`: a variable that is
 * still missing then means a seed did not run, and the tests fail instead of skipping out of the count.
 */
export type SeedGate = { run: true } | { run: false; fail: boolean; message: string }

export function seedGate(vars: Record<string, string | undefined>, hint: string, env: NodeJS.ProcessEnv = process.env): SeedGate {
  const missing = Object.keys(vars).filter(name => !vars[name])
  if (missing.length === 0) return { run: true }
  if (env.E2E_REQUIRE_SEEDED === '1') return { run: false, fail: true, message: `E2E_REQUIRE_SEEDED=1 but ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set: ${hint}` }
  return { run: false, fail: false, message: hint }
}

/**
 * Call in a `describe` (or at the top of a file) in place of `test.skip(!VAR, hint)`. `vars` maps each variable's name
 * to its value; the tests of that scope skip, or fail under `E2E_REQUIRE_SEEDED=1`, when any is empty.
 */
export function skipUnlessSeeded(test: typeof base, vars: Record<string, string | undefined>, hint: string): void {
  const gate = seedGate(vars, hint)
  if (gate.run) return
  if (gate.fail) test.beforeEach(() => { throw new Error(gate.message) })
  else test.skip(true, gate.message)
}
