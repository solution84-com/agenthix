import { isDemoMode } from '@agenthix/core'

/** What a workflow start answers in the demo, which hq shows as the refusal. */
export const DEMO_WORKFLOWS_REFUSAL = "The demo can't run workflows."

const NO_CONTAINERS = "The demo starts no containers, so this site runs nothing in one."

/** The demo's answer to a request that would start a container on this site. */
export const DEMO_REFUSED_METHOD = { message: 'The demo does not run this.', code: 'demo_refused' } as const

export const siteInDemoMode = (): boolean => isDemoMode(process.env)

/** The last line before a container would start: in the demo it never does. */
export function refuseContainerInDemo(): void {
  if (siteInDemoMode()) throw new Error(NO_CONTAINERS)
}
