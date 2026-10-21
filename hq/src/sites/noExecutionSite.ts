import { HttpError } from 'wasp/server'
import { NO_EXECUTION_SITE_MESSAGE } from '../shared/noExecutionSite'

/**
 * 503, not 400: the request is fine, the installation has no site to serve it,
 * and registering one fixes it. Every action that needs a site throws this one
 * error so the browser shows the same sentence wherever the person met it.
 */
export function noExecutionSiteError(): HttpError {
  return new HttpError(503, NO_EXECUTION_SITE_MESSAGE)
}
