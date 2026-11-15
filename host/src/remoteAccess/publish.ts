/**
 * Writes the Fleet Console's compose file again and brings it up, so its published ports follow remote access
 * (`remoteAccessPort`, read when the file is written). Its admission is taken from the file it runs with now, so a
 * pairing secret or an unredeemed code carries over as it was. Unchanged ports leave the container running.
 */
import { consoleHere, writeAndStartConsole } from '../install/console'
import type { ConsoleAdmission } from '../compose/console'
import type { Context } from '../service/context'

/** How the Fleet Console here is admitted to HQ, as its compose file says: kept when it is written again. */
export function admissionNow(ctx: Context): ConsoleAdmission {
  const compose = ctx.state.readJson('console', 'compose.json') as { services?: { console?: { environment?: Record<string, unknown> } } } | null
  const env = compose?.services?.console?.environment ?? {}
  // The file escapes `$` for compose (composeJson); the value is the one before that.
  const plain = (v: unknown) => (typeof v === 'string' ? v.replace(/\$\$/g, '$') : undefined)
  const admission: ConsoleAdmission = {}
  const pairingSecret = plain(env.HQ_CONSOLE_PAIRING_SECRET)
  const hqCode = plain(env.CONSOLE_HQ_CODE)
  if (pairingSecret) admission.pairingSecret = pairingSecret
  if (hqCode) admission.hqCode = hqCode
  return admission
}

export async function republishConsole(ctx: Context): Promise<void> {
  const here = consoleHere(ctx)
  if (!here) return
  await writeAndStartConsole(ctx, here.settings, admissionNow(ctx))
}
