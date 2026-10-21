import { HttpError } from 'wasp/server'
import { isFleetAdmin } from '../fleet/fleetAdminRole'

export async function assertAdmin(context: any): Promise<string> {
  if (!context.user) throw new HttpError(401)
  const settings = await context.entities.UserSettings.findFirst({ where: { userId: context.user.id } })
  if (settings?.role !== 'ADMIN') throw new HttpError(403, 'Admin access required')
  return context.user.id
}

/**
 * Figures, versions and logs of a site are for the accounts holding the fleet admin role (host-management spec §10),
 * checked here on the server, not by what a screen shows. An organisation admin who is not a fleet admin is refused.
 */
export async function assertFleetAdmin(context: any): Promise<string> {
  if (!context.user) throw new HttpError(401)
  if (!(await isFleetAdmin(context.user.id))) throw new HttpError(403, FLEET_ADMIN_ONLY)
  return context.user.id
}

export const FLEET_ADMIN_ONLY = 'Fleet admin access required'
