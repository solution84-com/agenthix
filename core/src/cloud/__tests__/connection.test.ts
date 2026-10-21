import { describe, expect, it } from 'vitest'
import {
  CLOUD_CONNECT_TOKEN_PATH, CLOUD_URL_SETTING, cloudEndpoint, configuredCloudUrl, DEFAULT_CLOUD_URL, parseCloudAccessToken, parseCloudBaseUrl, parseCloudConnectError,
  parseCloudDeviceAuthorization, parseCloudDeviceRequest, readDevicePoll,
} from '../connection.js'

const BASE = parseCloudBaseUrl('https://cloud.example.com')!
const KEY = 'O2onvM62pC1io6jQKm8Nc2UyFXcd4kOmOsBIoYtZ2ik'
const CLIENT = 'kPrK_qmxVWaYVA9wwBF6Iuo3vVzz7TxHCTwXBygrS4k'

const authorization = (over: object = {}) => ({
  device_code: 'GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS',
  user_code: 'WDJB-MJHT',
  verification_uri: 'https://cloud.example.com/connect',
  verification_uri_complete: 'https://cloud.example.com/connect?user_code=WDJB-MJHT',
  expires_in: 900,
  interval: 5,
  ...over,
})

describe("Cloud's base URL @SC-1082 @SC-1136", () => {
  it('is one setting, CLOUD_URL, and Cloud\'s own address when it is not set', () => {
    expect(CLOUD_URL_SETTING).toBe('CLOUD_URL')
    expect(configuredCloudUrl({})).toBe(DEFAULT_CLOUD_URL)
    expect(configuredCloudUrl({ CLOUD_URL: '  ' })).toBe(DEFAULT_CLOUD_URL)
    expect(configuredCloudUrl({ CLOUD_URL: ' https://cloud.staging.example ' })).toBe('https://cloud.staging.example')
  })

  it('is https, or http to this machine only, with no path, query or credentials', () => {
    expect(parseCloudBaseUrl('https://cloud.agenthix.com')?.origin).toBe('https://cloud.agenthix.com')
    expect(parseCloudBaseUrl('http://127.0.0.1:4500')).not.toBeNull()
    expect(parseCloudBaseUrl('http://localhost:4500/')).not.toBeNull()
    for (const bad of ['http://cloud.example.com', 'https://cloud.example.com/api', 'https://u:p@cloud.example.com', 'https://cloud.example.com/?a=1', 'ftp://x', 'nope']) {
      expect(parseCloudBaseUrl(bad)).toBeNull()
    }
  })

  it('names each endpoint by its full URL, which is an assertion\'s audience', () => {
    expect(cloudEndpoint(BASE, CLOUD_CONNECT_TOKEN_PATH)).toBe('https://cloud.example.com/connect/token')
  })
})

describe('a connection request @SC-1082', () => {
  it('carries the address hq\'s sign-ins come back to, normalised as Cloud registers it', () => {
    expect(parseCloudDeviceRequest({ public_key: KEY, hq_address: 'https://HQ.acme.example/', organisation_name: 'Acme' })?.hq_address).toBe('https://hq.acme.example')
  })

  it('carries a 32-byte public key, the address and the organisation\'s name', () => {
    expect(parseCloudDeviceRequest({ public_key: KEY, hq_address: 'https://hq.acme.example', organisation_name: 'Acme Robotics' }))
      .toEqual({ public_key: KEY, hq_address: 'https://hq.acme.example', organisation_name: 'Acme Robotics' })
    expect(parseCloudDeviceRequest({ public_key: KEY.slice(1), hq_address: 'https://hq.acme.example', organisation_name: 'Acme' })).toBeNull()
    expect(parseCloudDeviceRequest({ public_key: KEY, hq_address: 'javascript:alert(1)', organisation_name: 'Acme' })).toBeNull()
    expect(parseCloudDeviceRequest({ public_key: KEY, hq_address: 'https://hq.acme.example/?next=x', organisation_name: 'Acme' })).toBeNull()
    expect(parseCloudDeviceRequest({ public_key: KEY, hq_address: 'https://hq.acme.example', organisation_name: ' ' })).toBeNull()
  })
})

describe("Cloud's answer to it @SC-1082", () => {
  it('is taken as RFC 8628 has it', () => {
    expect(parseCloudDeviceAuthorization(authorization(), BASE)).toEqual(authorization())
    expect(parseCloudDeviceAuthorization(authorization({ interval: undefined }), BASE)?.interval).toBe(5)
  })

  it('is refused when the approval page is not on Cloud\'s own origin', () => {
    expect(parseCloudDeviceAuthorization(authorization({ verification_uri: 'https://cloud.example.com.evil.example/connect' }), BASE)).toBeNull()
    expect(parseCloudDeviceAuthorization(authorization({ verification_uri_complete: 'http://cloud.example.com/connect' }), BASE)).toBeNull()
  })

  it('is refused when the user code is not one a person can check, or the times are out of bounds', () => {
    for (const over of [{ user_code: 'wdjb-mjht' }, { user_code: 'AEIO-UAEI' }, { user_code: 'WDJBMJHT' }, { expires_in: 0 }, { expires_in: 7200 }, { interval: 0 }, { device_code: 'short' }]) {
      expect(parseCloudDeviceAuthorization(authorization(over), BASE)).toBeNull()
    }
  })
})

describe('polling @SC-1082', () => {
  const approved = { access_token: 'tok_0123456789abcdef', token_type: 'Bearer', expires_in: 300, client_id: CLIENT, cloud_organisation: { id: 'org_42', name: 'Acme Robotics' } }

  it('reads each answer the device flow names', () => {
    expect(readDevicePoll(400, { error: 'authorization_pending' }, CLIENT)).toEqual({ kind: 'pending' })
    expect(readDevicePoll(400, { error: 'slow_down' }, CLIENT)).toEqual({ kind: 'slowDown' })
    expect(readDevicePoll(400, { error: 'access_denied' }, CLIENT)).toEqual({ kind: 'refused' })
    expect(readDevicePoll(400, { error: 'expired_token' }, CLIENT)).toEqual({ kind: 'expired' })
    expect(readDevicePoll(200, approved, CLIENT)).toEqual({ kind: 'approved', approved })
  })

  it('refuses an approval for another client id, and anything it does not know', () => {
    expect(readDevicePoll(200, { ...approved, client_id: 'x'.repeat(43) }, CLIENT)).toBeNull()
    expect(readDevicePoll(200, { ...approved, cloud_organisation: { id: 'org 42', name: 'A' } }, CLIENT)).toBeNull()
    expect(readDevicePoll(400, { error: 'invalid_client' }, CLIENT)).toBeNull()
    expect(readDevicePoll(500, 'oops', CLIENT)).toBeNull()
  })
})

describe('tokens and errors @SC-1082', () => {
  it('a token is short-lived and Bearer', () => {
    expect(parseCloudAccessToken({ access_token: 'tok_0123456789abcdef', token_type: 'bearer', expires_in: 60 })?.token_type).toBe('Bearer')
    expect(parseCloudAccessToken({ access_token: 'tok_0123456789abcdef', token_type: 'Bearer', expires_in: 86_400 })).toBeNull()
    expect(parseCloudAccessToken({ access_token: 'tok_0123456789abcdef', token_type: 'MAC', expires_in: 60 })).toBeNull()
  })

  it('an error is one RFC 6749 names', () => {
    expect(parseCloudConnectError({ error: 'invalid_client', error_description: 'Revoked.' })).toEqual({ error: 'invalid_client', error_description: 'Revoked.' })
    expect(parseCloudConnectError({ error: 'teapot' })).toBeNull()
  })
})
