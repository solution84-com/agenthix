/**
 * Whether this hq is the public demo (adr-0186): `DEMO_MODE=true` in its environment, written only by the host service
 * for `agenthix install --demo`. Read once, at first use, and kept; tests set it with `setDemoModeForTests`.
 */
import { isDemoMode } from '@agenthix/core'

let demo: boolean | null = null

export function demoOn(): boolean {
  if (demo === null) demo = isDemoMode(process.env)
  return demo
}

/** For tests only: on, off, or null to read the environment again at the next use. */
export function setDemoModeForTests(on: boolean | null): void {
  demo = on
}

export { DEMO_REFUSAL } from './demoWords'
