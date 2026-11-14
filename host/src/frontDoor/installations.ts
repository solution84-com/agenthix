/**
 * `front-door add-installation <namespace>` and `remove-installation <namespace>`: another installation on this
 * machine served by this one's front door, or no longer (neighbours.ts). Only from the machine's own command line,
 * never from a controller. Run again for one it serves, it reads that installation's addresses afresh. The front door must be on; it is written and started again, and its certificates checked,
 * as `front-door on` does — anything that fails puts it back as it was.
 */
import type { Progress } from '../sockets/lineServer'
import type { Context } from '../service/context'
import { Refusal } from '../owner/results'
import { cmd } from '../cli/words'
import { frontDoorOn, frontDoorSettings } from './frontDoor'

export async function frontDoorInstallation(
  ctx: Context, namespace: string, remove: boolean, progress: (p: Progress) => void,
): Promise<{ installations: string[] }> {
  const settings = frontDoorSettings(ctx)
  if (!settings?.on) throw new Refusal('conflict', `The front door is off here. Turn it on first: ${cmd('front-door on')}`)
  const before = settings.installations ?? []
  if (remove && !before.includes(namespace)) throw new Refusal('not_found', `The front door does not serve the installation ${namespace}. Nothing changed.`)
  // Asked again for one it serves, it reads that installation's addresses afresh: a files host changed since is served.
  const installations = remove ? before.filter(ns => ns !== namespace) : before.includes(namespace) ? before : [...before, namespace]
  await frontDoorOn(ctx, undefined, progress, undefined, undefined, installations)
  return { installations }
}
