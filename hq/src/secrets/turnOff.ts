/**
 * Revoking is one action (spec part 3, S7): *Turn off what uses it* switches off every workflow whose approved version
 * names the secret or variable, through the library's own switch, which also stops each run in progress. The answer
 * lists what was turned off and the runs that were stopped, so the screen can say what to do next: replace the value
 * at its issuer, then turn them back on.
 */
import { turnOffWorkflows } from '../workflows/switch'
import { requireAdministerPlace } from './access'
import { secretsDb } from './db'
import type { Place } from './place'
import { workflowsUsing, type UsingWorkflow, type ValueKind } from './usedBy'

export type TurnedOff = {
  workflows: UsingWorkflow[]
  /** The runs in progress the site stopped. */
  runsStopped: string[]
  next: string
}

export async function turnOffWhatUses(place: Place, byUserId: string, kind: ValueKind, name: string): Promise<TurnedOff> {
  await requireAdministerPlace(place, byUserId, 'Turning off what uses it')
  const workflows = (await workflowsUsing(place, kind, name)).filter(w => w.enabled)
  const next = kind === 'secret'
    ? `Replace ${name} at its issuer and here, then turn the workflows back on.`
    : `Change ${name}, then turn the workflows back on.`
  if (workflows.length === 0) return { workflows, runsStopped: [], next }
  const ids = workflows.map(w => w.id)
  const { stopped } = await turnOffWorkflows(ids, `the ${kind} ${name} was turned off`, byUserId)
  if (kind === 'secret') {
    const secret = await secretsDb().secretByName(place, name)
    await secretsDb().addRecords(place, [{
      secretName: name, secretId: secret?.id ?? null, action: 'TURNED_OFF_USERS', byUserId, runId: null, at: new Date(),
    }])
  }
  return { workflows: workflows.map(w => ({ ...w, enabled: false })), runsStopped: stopped, next }
}
