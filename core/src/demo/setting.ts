/**
 * The demo setting (adr-0186): an install setting, not a feature flag. The host service writes `DEMO_MODE=true` into
 * hq's and the site's environment for `agenthix install --demo`; each program reads it once at start. Anything but
 * exactly `true` is off, so a typo or a missing value leaves an ordinary install.
 *
 * Callers pass the environment they read (`process.env` on a server), so this module stays free of Node.
 */

export const DEMO_MODE_ENV = 'DEMO_MODE'

type Env = Record<string, string | undefined>

export function isDemoMode(env: Env): boolean {
  return env[DEMO_MODE_ENV] === 'true'
}

/** Where the hq and site images hold the demo's data (`demo/` at the repository root). */
export const DEMO_DATA_DIR = '/demo'

/** Overrides `DEMO_DATA_DIR` outside an image, such as a development run pointed at the repository's `demo/`. */
export const DEMO_DATA_DIR_ENV = 'DEMO_DATA_DIR'

export function demoDataDir(env: Env): string {
  const given = env[DEMO_DATA_DIR_ENV]
  return given && given.startsWith('/') ? given : DEMO_DATA_DIR
}
