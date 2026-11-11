import type { Refusal } from '@agenthix/ui/primitives'
import type { FleetAdmin } from '../../api/session'
import { GIVE_COMMAND } from './useFleetAdmins'

/** Why the only fleet admin's role cannot be removed here: known from the list before the press, so the control says so. */
export function lastAdmin(admin: FleetAdmin, isMe: boolean): Refusal {
  const title = isMe ? 'You are the only fleet admin' : `${admin.name} is the only fleet admin`
  return {
    reason: 'Give someone else the role first: without a fleet admin, nobody can sign in to the Fleet Console.',
    title,
    detail: <>Give someone else the role first: without a fleet admin, nobody can sign in to the Fleet Console. If nobody holds the role, a machine admin of HQ's machine gives it again with <code className="font-mono text-[.92em]">{GIVE_COMMAND}</code>.</>,
  }
}
