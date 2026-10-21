import { describe, expect, it } from 'vitest'
import {
  CLOUD_BUSY_STATUS, CLOUD_ERROR_STATUS, CLOUD_RETRY_AFTER_DEFAULT_S, CLOUD_RETRY_AFTER_MAX_S, parseCloudBearerError,
  parseCloudDowntimeAccepted,
} from '../answers.js'

describe("Cloud's answers and errors, with the status each is sent with @SC-1135", () => {
  it('names a status for every error, as RFC 6749 and RFC 6750 have them', () => {
    expect(CLOUD_ERROR_STATUS).toMatchObject({
      invalid_request: 400, invalid_grant: 400, authorization_pending: 400, slow_down: 400, invalid_client: 401,
      invalid_token: 401, not_found: 404,
    })
    expect(CLOUD_BUSY_STATUS).toBe(429)
    expect(CLOUD_RETRY_AFTER_DEFAULT_S).toBe(60)
    expect(CLOUD_RETRY_AFTER_MAX_S).toBe(3600)
  })

  it('reads the bearer endpoints\' errors, and nothing else as one', () => {
    expect(parseCloudBearerError({ error: 'invalid_token' })).toEqual({ error: 'invalid_token' })
    expect(parseCloudBearerError({ error: 'not_found', error_description: 'no link' })).toEqual({ error: 'not_found', error_description: 'no link' })
    expect(parseCloudBearerError({ error: 'invalid_client' })).toBeNull()
    expect(parseCloudBearerError('nope')).toBeNull()
  })

  it('reads the downtime notice taken', () => {
    expect(parseCloudDowntimeAccepted({ accepted: true })).toEqual({ accepted: true })
    expect(parseCloudDowntimeAccepted({ accepted: false })).toBeNull()
    expect(parseCloudDowntimeAccepted(null)).toBeNull()
  })
})
