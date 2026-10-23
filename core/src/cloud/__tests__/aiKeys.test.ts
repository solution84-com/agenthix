import { describe, expect, it } from 'vitest'
import { parseCloudKeyRegistered, parseCloudKeyRegistration } from '../aiKeys.js'
import { JWT_BEARER_ASSERTION_TYPE } from '../connection.js'

const KEY = 'A'.repeat(42) + 'E'
const KID = 'k'.repeat(43)
const form = { client_assertion_type: JWT_BEARER_ASSERTION_TYPE, client_assertion: 'a.b.c', public_key: KEY, proof: 'p.q.r' }

describe('the key rollover (C8)', () => {
  it("Cloud's side reads a registration, with retire_old_now only as 'true'", () => {
    expect(parseCloudKeyRegistration(form)).toEqual(form)
    expect(parseCloudKeyRegistration({ ...form, retire_old_now: 'true' })).toEqual({ ...form, retire_old_now: 'true' })
    expect(parseCloudKeyRegistration({ ...form, retire_old_now: 'yes' })).toBeNull()
    expect(parseCloudKeyRegistration({ ...form, public_key: 'nope' })).toBeNull()
    expect(parseCloudKeyRegistration({ ...form, proof: undefined })).toBeNull()
    expect(parseCloudKeyRegistration({ ...form, client_assertion_type: 'other' })).toBeNull()
  })

  it("hq's side reads the answer only for the kid it worked out", () => {
    expect(parseCloudKeyRegistered({ kid: KID, old_key_retires_at: '2026-10-24T10:00:00Z' }, KID))
      .toEqual({ kid: KID, old_key_retires_at: '2026-10-24T10:00:00.000Z' })
    expect(parseCloudKeyRegistered({ kid: 'j'.repeat(43), old_key_retires_at: '2026-10-24T10:00:00Z' }, KID)).toBeNull()
    expect(parseCloudKeyRegistered({ kid: KID, old_key_retires_at: 'later' }, KID)).toBeNull()
  })
})
