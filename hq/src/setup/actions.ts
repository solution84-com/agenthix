import { HttpError } from 'wasp/server'
import { finishSetup } from './setupState'

/**
 * Setup's last step finished or skipped (getting-in spec): setup is then done
 * for this hq. For anyone but the first admin, or once done, it changes nothing.
 * Never reaches an Execution Site, so a site outage cannot hold setup open.
 */
export const completeSetup = async (_args: void, context: { user?: { id: string } | null }): Promise<{ done: boolean }> => {
  if (!context.user) throw new HttpError(401)
  await finishSetup(context.user.id)
  return { done: true }
}
