import { beforeEach, type Mock } from 'vitest'

/**
 * A spy on a function of a real module. It keeps the real parameter types, so a call is checked against the
 * real signature; the return type is left open (`any`) because tests stub partial rows (`[{ id: 'run-1' }]`)
 * rather than building every field of a full row.
 */
export type Spy<F extends (...args: any[]) => unknown> = Mock<(...args: Parameters<F>) => any>

/** Every name `Real` exports that `Fake` does not. A fake assigns this to `never` so a missing export fails typecheck. */
export type MissingFrom<Real, Fake> = Exclude<keyof Real, keyof Fake>

/**
 * Runs `reset` before every test. Called when a fake is first imported, which is during the test file's own
 * imports; a fake first imported inside a running test (a dynamic import) cannot register a hook, and the test
 * that does so resets the fake itself.
 */
export function resetBeforeEachTest(reset: () => void): void {
  try {
    beforeEach(reset)
  } catch {
    // Registered too late for a hook; the importing test calls reset() itself.
  }
}
