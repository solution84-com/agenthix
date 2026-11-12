import { useQuery, getDemoInfo } from 'wasp/client/operations'
import type { DemoInfo } from './demoInfo'
import type { Refusal } from '@agenthix/ui/primitives'
import { GUIDE_URL } from '../shared/components/sidebar/mainNav'
import { DEMO_CONTROL_REFUSAL } from './demoWords'

/**
 * The demo as the screens see it (`getDemoInfo`): read once and kept, since the setting is the install's and does not
 * change while hq runs. Until it has answered, and if it never does, the screens behave as an ordinary install; the
 * server's guard refuses what the demo must not do whatever the screen shows.
 */
export function useDemo(): DemoInfo {
  const { data } = useQuery(getDemoInfo, undefined, { staleTime: Infinity, gcTime: Infinity })
  return data ?? { on: false }
}

/**
 * What an agent's scripts answer, first few, in place of a screen's own suggestions; null outside the demo or for an
 * agent with no scripts (live demo walkthrough, finding 14: Home's first suggestions are refused in the demo).
 */
export function useDemoPrompts(handle: string | undefined, count = 3): string[] | null {
  const demo = useDemo()
  if (!demo.on || !handle) return null
  const prompts = demo.agents[handle]?.suggestedPrompts ?? []
  return prompts.length > 0 ? prompts.slice(0, count) : null
}

/**
 * Dictation, drawn refused in the demo: it would send the person's voice to a speech vendor, which the demo never
 * reaches, so the browser is never asked for the microphone. Every other refusal is the server's (the demo guard).
 */
export const DEMO_CONTROL: Refusal = { reason: DEMO_CONTROL_REFUSAL, title: 'Not in the demo' }

/** The user guide's page on the demo: what is scripted, what is refused, what resets. */
export const DEMO_GUIDE_URL = `${GUIDE_URL}getting-started/trying-the-demo/`

/** The demo's privacy notice: what it keeps about a visitor, and for how long. */
export const DEMO_PRIVACY_URL = `${GUIDE_URL}getting-started/demo-privacy/`
