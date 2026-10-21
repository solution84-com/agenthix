/**
 * Who looks after the organisation's machines, and so who is told when one runs short (host-management spec §1,
 * §10): the accounts holding the fleet admin role (fleet/fleetAdminRole.ts). Every notice meant for fleet admins asks
 * this for its recipients.
 */
import { fleetAdminIds } from '../fleet/fleetAdminRole'

export function fleetAdminRecipients(): Promise<string[]> {
  return fleetAdminIds()
}
