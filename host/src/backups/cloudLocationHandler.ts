/** `backup.location.set`, a Cloud-only operation (cloud/handlers.ts): the work is in `cloudLocation.ts`. */
import type { CloudOnlyHandler } from '../cloud/handlers'
import { parseCloudLocation, setCloudLocation } from './cloudLocation'

export const backupLocationSet: CloudOnlyHandler<'backup.location.set'> = {
  parse: parseCloudLocation,
  run: async (ctx, request) => setCloudLocation(ctx.state, ctx.now(), request),
}
