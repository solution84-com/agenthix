import { describe, expect, it } from 'vitest'
import { parseHqCloudRequest, parseOrganisationKeyResult } from '../cloudOperations.js'
import { isCloudOrganisationId } from '../../cloud/connection.js'

const HASH = 'a'.repeat(64)

describe("the fields of Cloud's operations that hq answers, one rule for every side @SC-1135", () => {
  it('reads each operation', () => {
    expect(parseHqCloudRequest('site.register', { machineId: 'm-1', siteName: 'Helsinki', credentialHash: HASH.toUpperCase() }))
      .toEqual({ ok: true, request: { op: 'site.register', machineId: 'm-1', siteName: 'Helsinki', credentialHash: HASH } })
    expect(parseHqCloudRequest('site.unregister', { executionSiteId: 'site:1.a' })).toEqual({ ok: true, request: { op: 'site.unregister', executionSiteId: 'site:1.a' } })
    expect(parseHqCloudRequest('account.firstLink', { ref: 'ref_1' })).toEqual({ ok: true, request: { op: 'account.firstLink', ref: 'ref_1' } })
    expect(parseHqCloudRequest('account.resetLink', { username: 'dana' })).toEqual({ ok: true, request: { op: 'account.resetLink', username: 'dana' } })
    expect(parseHqCloudRequest('account.adminInvite', {})).toEqual({ ok: true, request: { op: 'account.adminInvite' } })
    expect(parseHqCloudRequest('organisation.key', {})).toEqual({ ok: true, request: { op: 'organisation.key' } })
    expect(parseHqCloudRequest('organisation.connect', { cloudOrganisationId: 'org_42', name: 'Acme Robotics' }))
      .toEqual({ ok: true, request: { op: 'organisation.connect', cloudOrganisationId: 'org_42', name: 'Acme Robotics' } })
  })

  it('names the first field that is missing or not valid', () => {
    expect(parseHqCloudRequest('site.register', { machineId: 'm-1', siteName: ' Helsinki', credentialHash: HASH })).toEqual({ ok: false, field: 'siteName' })
    expect(parseHqCloudRequest('site.register', { machineId: 'm 1', siteName: 'Helsinki', credentialHash: HASH })).toEqual({ ok: false, field: 'machineId' })
    expect(parseHqCloudRequest('site.register', { machineId: 'm-1', siteName: 'Helsinki', credentialHash: 'abc' })).toEqual({ ok: false, field: 'credentialHash' })
    expect(parseHqCloudRequest('account.firstLink', { ref: 'a.b' })).toEqual({ ok: false, field: 'ref' })
    expect(parseHqCloudRequest('account.resetLink', { username: 'da na' })).toEqual({ ok: false, field: 'username' })
    expect(parseHqCloudRequest('organisation.connect', { cloudOrganisationId: 'org_42', name: 'Acme\nRobotics' })).toEqual({ ok: false, field: 'name' })
    expect(parseHqCloudRequest('organisation.connect', { cloudOrganisationId: 7, name: 'Acme' })).toEqual({ ok: false, field: 'cloudOrganisationId' })
  })

  it("holds Cloud's organisation id to the rule the connection uses, on both of Cloud's ways to connect", () => {
    for (const id of ['org.42', 'org:42', '', 'o'.repeat(65)]) {
      expect(isCloudOrganisationId(id)).toBe(false)
      expect(parseHqCloudRequest('organisation.connect', { cloudOrganisationId: id, name: 'Acme' })).toEqual({ ok: false, field: 'cloudOrganisationId' })
    }
    expect(isCloudOrganisationId('org_42-A')).toBe(true)
  })
})

describe("hq's answer to organisation.key @SC-1135", () => {
  const key = 'O2onvM62pC1io6jQKm8Nc2UyFXcd4kOmOsBIoYtZ2ik'
  const clientId = 'kPrK_qmxVWaYVA9wwBF6Iuo3vVzz7TxHCTwXBygrS4k'

  it('carries the address Cloud registers with the key', () => {
    expect(parseOrganisationKeyResult({ publicKey: key, clientId, hqAddress: 'https://HQ.acme.example/' }))
      .toEqual({ publicKey: key, clientId, hqAddress: 'https://hq.acme.example' })
  })

  it('is refused without a valid key, client id or address', () => {
    expect(parseOrganisationKeyResult({ publicKey: key, clientId })).toBeNull()
    expect(parseOrganisationKeyResult({ publicKey: 'pk', clientId, hqAddress: 'https://hq.acme.example' })).toBeNull()
    expect(parseOrganisationKeyResult({ publicKey: key, clientId: 'cid', hqAddress: 'https://hq.acme.example' })).toBeNull()
    expect(parseOrganisationKeyResult({ publicKey: key, clientId, hqAddress: 'https://hq.acme.example/?x' })).toBeNull()
  })
})
