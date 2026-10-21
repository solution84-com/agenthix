import { HttpError } from 'wasp/server'
import { PackageContentError, PackageWriteConflictError } from './packageStore'
import { AgentContentMissingError } from './agentPackageService'

/** A change refused for its content is the caller's to fix (400); a race or missing content is a conflict (409). */
export async function packageWriteOrHttp<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof PackageContentError) throw new HttpError(400, err.message)
    if (err instanceof PackageWriteConflictError || err instanceof AgentContentMissingError) throw new HttpError(409, err.message)
    throw err
  }
}
