import type { Response } from 'express'
import { HqCallError } from '../../hq/link'

/**
 * Asks hq a method an older hq does not have: such an hq is said to be older, so a screen says so rather than show
 * nothing as though there were nothing. Undefined when it answered so; any other failure goes to the error handler.
 */
export async function askNewerHq<T>(res: Response, ask: () => Promise<T>): Promise<T | undefined> {
  try {
    return await ask()
  } catch (err) {
    if (!(err instanceof HqCallError) || err.code !== 'unknown_method') throw err
    res.status(501).json({ error: 'hq_too_old', message: 'HQ does not keep this yet: it is older than this Fleet Console. Upgrade HQ to see it here.' })
    return undefined
  }
}

/** HQ answered in a shape it does not use: nothing of it is shown. */
export function notUnderstood(res: Response): void {
  res.status(502).json({ error: 'failed', message: 'HQ answered in a way this Fleet Console does not understand.' })
}
