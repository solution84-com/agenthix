/**
 * The one way the screens talk to the Fleet Console: JSON under `/api`, on this origin only, with the session's CSRF
 * header on every request. A 401 means signed out: the token is forgotten and whoever listens is told, so the screens
 * return to the sign-in page wherever they were.
 */
import { csrfToken, forgetCsrfToken } from './csrf'

export const CSRF_HEADER = 'x-csrf-token'

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

export type SignedOutReason = { code: string; message: string }
type SignedOutListener = (reason: SignedOutReason) => void

const signedOutListeners = new Set<SignedOutListener>()

/** Told whenever a request finds the session gone; returns the way to stop listening. */
export function onSignedOut(listener: SignedOutListener): () => void {
  signedOutListeners.add(listener)
  return () => { signedOutListeners.delete(listener) }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  /** Signing in answers 401 for a wrong password, which is not a session ending. */
  signedOutOn401?: boolean
}

export async function api<T>(path: string, { method = 'GET', body, signedOutOn401 = true }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' }
  const token = csrfToken()
  if (token) headers[CSRF_HEADER] = token
  if (body !== undefined) headers['content-type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'unreachable', 'The Fleet Console is not answering. Check that it is running on its machine, then try again.')
  }

  if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T

  const { error, message } = await errorOf(res)
  if (res.status === 401 && signedOutOn401) {
    forgetCsrfToken()
    for (const listener of [...signedOutListeners]) listener({ code: error, message })
  }
  throw new ApiError(res.status, error, message)
}

async function errorOf(res: Response): Promise<{ error: string; message: string }> {
  try {
    const body = (await res.json()) as { error?: unknown; message?: unknown }
    return {
      error: typeof body.error === 'string' ? body.error : 'failed',
      message: typeof body.message === 'string' ? body.message : 'Something went wrong in the Fleet Console. Try again.',
    }
  } catch {
    return { error: 'failed', message: 'Something went wrong in the Fleet Console. Try again.' }
  }
}
