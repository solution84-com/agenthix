/**
 * The flags a unit test has switched on in memory, through `withFeature` in core's `./testing` entry; the root entry
 * does not export the writers. `isFeatureOn` reads them only in a test run (`NODE_ENV` exactly `test`), so a
 * production build ignores them whatever is set here.
 *
 * Kept on `globalThis` rather than in this module, so a second copy of core loaded into the same test process (a
 * bundled server beside the test's own import) still sees what the test switched on.
 */
const KEY = Symbol.for('featureFlags.testSwitches')

type Counts = Map<string, number>

function counts(): Counts {
  const holder = globalThis as unknown as Record<symbol, Counts | undefined>
  let map = holder[KEY]
  if (!(map instanceof Map)) {
    map = new Map()
    holder[KEY] = map
  }
  return map
}

export function isSwitchedOnForTest(flag: string): boolean {
  return (counts().get(flag) ?? 0) > 0
}

/** Counted, so a group nested inside another group for the same flag leaves it on until the outer one ends. */
export function switchOnForTest(flag: string): void {
  const map = counts()
  map.set(flag, (map.get(flag) ?? 0) + 1)
}

export function switchOffForTest(flag: string): void {
  const map = counts()
  const left = (map.get(flag) ?? 0) - 1
  if (left > 0) map.set(flag, left)
  else map.delete(flag)
}
