/**
 * Demo mode reaches no voice vendor (live demo spec, *Voice is in, as a demo voice*): the demo plays recorded lines,
 * so nothing mints a token, synthesises or lists voices. Asked at the one place each vendor call leaves hq.
 */
import { demoOn } from '../demo/demoMode'

export const DEMO_NO_VOICE = 'The demo plays recorded voice lines, so no speech service is called.'

export function refuseVoiceVendorInDemo(): void {
  if (demoOn()) throw new Error(DEMO_NO_VOICE)
}
