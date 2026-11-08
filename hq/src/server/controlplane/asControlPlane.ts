/** A service's refusal, as the control plane says it: its own message, never a stack or a path. */
import { HttpError } from 'wasp/server'
import { ControlPlaneError, type ControlPlaneErrorCode } from './types'

export async function asControlPlane<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof HttpError) {
      const code: ControlPlaneErrorCode = err.statusCode === 404 ? 'not_found' : err.statusCode === 409 ? 'conflict' : err.statusCode === 403 ? 'forbidden' : 'invalid'
      if (err.statusCode < 500) throw new ControlPlaneError(code, err.message)
    }
    throw err
  }
}
