/**
 * hq's connection to Cloud against the stand-in Cloud server: the device flow driven by hq, tokens signed for and
 * kept in memory, disconnecting, and the rule that hq never calls Cloud unless connecting or connected.
 */
import { describe, expect, it } from 'vitest'
import { generateCloudConnectionKeys } from '@agenthix/core/cloud-crypto'
import { cloudClient } from '../cloudClient'
import { CloudConnectionError } from '../cloudConnection'
import { harness } from './connectionHarness'

describe("hq's connection to Agenthix Cloud", () => {
  it('asks Cloud for a connection with its public key, address and name, and shows the user code @SC-1086', async () => {
    const h = harness()
    const connecting = await h.connection.connect('u-sam')
    const device = h.cloud.devices[0]
    expect(connecting.userCode).toBe(device.userCode)
    expect(connecting.verificationUriComplete).toBe(`https://cloud.test/connect?user_code=${device.userCode}`)
    expect(device.publicKey).toBe(h.keys()!.publicKey)
    expect(device).toMatchObject({ hqAddress: 'https://hq.acme.example', organisationName: 'Acme Robotics' })
    expect(await h.connection.state()).toEqual({ connection: null, connecting, lastAttempt: null, problem: null })
  })

  it("refuses to ask while hq's address is not one Cloud can send sign-ins back to, and asks Cloud nothing @SC-1144", async () => {
    const h = harness()
    h.setAddress('not an address')
    await expect(h.connection.connect('u-sam')).rejects.toBeInstanceOf(CloudConnectionError)
    expect(h.cloud.requests).toEqual([])
  })

  it('registers its address with the connection, as Cloud holds it once approved @SC-1144', async () => {
    const h = harness()
    const { userCode } = await h.connection.connect('u-sam')
    h.cloud.approve(userCode)
    await h.advance(5_000)
    expect(h.cloud.clients.get(h.stored()!.clientId)?.hqAddress).toBe('https://hq.acme.example')
  })

  it('the private key never leaves hq: nothing sent to Cloud carries it @SC-1087', async () => {
    const h = harness()
    const { userCode } = await h.connection.connect('u-sam')
    const privateKey = h.keys()!.privateKey
    h.cloud.approve(userCode)
    await h.advance(5_000)
    await h.advance(300_000)
    await h.connection.accessToken()
    await h.connection.disconnect('u-sam')
    expect(h.cloud.requests.map(r => r.path)).toEqual(['/connect/device', '/connect/token', '/connect/token', '/connect/revoke'])
    expect(JSON.stringify(h.cloud.requests)).not.toContain(privateKey)
  })

  it('polls until approved, then keeps the connection and is connected as Cloud\'s organisation @SC-1088', async () => {
    const h = harness()
    const { userCode } = await h.connection.connect('u-sam')
    await h.advance(5_000)
    expect((await h.connection.state()).connecting).not.toBeNull()
    h.cloud.approve(userCode, { id: 'org_7', name: 'Acme on Cloud' })
    await h.advance(5_000)
    const state = await h.connection.state()
    expect(state.connecting).toBeNull()
    expect(state.connection).toEqual({ cloudOrganisationId: 'org_7', name: 'Acme on Cloud', connectedAt: expect.any(String) })
    expect(h.stored()?.clientId).toBe(h.cloud.devices[0].clientId)
    expect(h.events).toEqual(['connected Acme on Cloud by u-sam'])
  })

  it('honours slow_down: the interval grows, and it is approved all the same @SC-1088', async () => {
    const h = harness({ interval: 5 })
    const { userCode } = await h.connection.connect('u-sam')
    h.cloud.devices[0].interval = 8 // Cloud asks for more than it said
    await h.advance(5_000)
    await h.advance(5_000)
    expect(h.cloud.requests.filter(r => r.form.grant_type?.endsWith('device_code')).length).toBe(2)
    h.cloud.approve(userCode)
    await h.advance(10_000)
    expect((await h.connection.state()).connection).not.toBeNull()
  })

  it('a refusal on Cloud ends the request, and says so @SC-1088', async () => {
    const h = harness()
    const { userCode } = await h.connection.connect('u-sam')
    h.cloud.deny(userCode)
    await h.advance(5_000)
    expect(await h.connection.state()).toEqual({ connection: null, connecting: null, lastAttempt: 'refused', problem: null })
  })

  it('a request not approved in time lapses, and polling stops @SC-1088', async () => {
    const h = harness({ expiresIn: 30 })
    await h.connection.connect('u-sam')
    await h.advance(60_000)
    expect((await h.connection.state()).lastAttempt).toBe('expired')
    const polls = h.cloud.requests.length
    await h.advance(60_000)
    expect(h.cloud.requests.length).toBe(polls)
  })

  it('Cloud briefly away keeps the request waiting; away until it lapses, it failed @SC-1088', async () => {
    const h = harness({ expiresIn: 30 })
    await h.connection.connect('u-sam')
    for (let i = 0; i < 5; i++) {
      h.cloud.answerNextWith('network')
      await h.advance(5_000)
      if (!(await h.connection.state()).connecting) break
    }
    await h.advance(60_000)
    expect((await h.connection.state()).lastAttempt).toBe('failed')
  })

  it('asking again while one waits answers the same request; once connected it is refused @SC-1088', async () => {
    const h = harness()
    const first = await h.connection.connect('u-sam')
    expect(await h.connection.connect('u-jo')).toEqual(first)
    expect(h.cloud.devices).toHaveLength(1)
    h.cloud.approve(first.userCode)
    await h.advance(5_000)
    await expect(h.connection.connect('u-sam')).rejects.toBeInstanceOf(CloudConnectionError)
  })

  it('signs for access tokens and keeps each until shortly before it lapses @SC-1087', async () => {
    const h = harness({ tokenLifetime: 300 })
    const { userCode } = await h.connection.connect('u-sam')
    h.cloud.approve(userCode)
    await h.advance(5_000)
    const fromApproval = await h.connection.accessToken()
    expect(fromApproval).toMatch(/^tok_1_/)
    await h.advance(200_000)
    expect(await h.connection.accessToken()).toBe(fromApproval)
    await h.advance(60_000)
    const fresh = await h.connection.accessToken()
    expect(fresh).toMatch(/^tok_2_/)
    expect(await Promise.all([h.connection.accessToken(), h.connection.accessToken()])).toEqual([fresh, fresh])
  })

  it('disconnecting revokes at Cloud, and forgets the connection, the key and the token @SC-1089', async () => {
    const h = harness()
    const { userCode } = await h.connection.connect('u-sam')
    h.cloud.approve(userCode)
    await h.advance(5_000)
    const clientId = h.stored()!.clientId
    expect(await h.connection.disconnect('u-sam')).toBe(true)
    expect(h.cloud.clients.get(clientId)?.revoked).toBe(true)
    expect(h.stored()).toBeNull()
    expect(h.keys()).toBeNull()
    expect(await h.connection.accessToken()).toBeNull()
    expect(h.events).toContain('disconnected Acme Robotics by u-sam')
    expect(await h.connection.disconnect('u-sam')).toBe(false)
  })

  it('disconnecting while Cloud is away still forgets everything, so the key can never be used again @SC-1089', async () => {
    const h = harness()
    const { userCode } = await h.connection.connect('u-sam')
    h.cloud.approve(userCode)
    await h.advance(5_000)
    h.cloud.answerNextWith('network')
    expect(await h.connection.disconnect('u-sam')).toBe(true)
    expect(h.stored()).toBeNull()
    expect(h.keys()).toBeNull()
  })

  it('reconnecting after a disconnect uses a new key @SC-1089', async () => {
    const h = harness()
    const first = await h.connection.connect('u-sam')
    h.cloud.approve(first.userCode)
    await h.advance(5_000)
    await h.connection.disconnect('u-sam')
    await h.connection.connect('u-sam')
    expect(h.keysMade()).toBe(2)
    expect(h.cloud.devices[1].publicKey).not.toBe(h.cloud.devices[0].publicKey)
  })

  it('disconnecting a request still waiting drops it and polls no more @SC-1089', async () => {
    const h = harness()
    const { userCode } = await h.connection.connect('u-sam')
    expect(await h.connection.disconnect('u-sam')).toBe(true)
    h.cloud.approve(userCode)
    const before = h.cloud.requests.length
    await h.advance(30_000)
    expect(h.cloud.requests.length).toBe(before)
    expect(await h.connection.state()).toEqual({ connection: null, connecting: null, lastAttempt: null, problem: null })
  })

  it('Cloud ending the connection from its side: the next token request is refused, and hq forgets it @SC-1089', async () => {
    const h = harness({ tokenLifetime: 60 })
    const { userCode } = await h.connection.connect('u-sam')
    h.cloud.approve(userCode)
    await h.advance(5_000)
    h.cloud.revokeFromCloud(h.stored()!.clientId)
    expect(await h.connection.accessToken()).toBeNull()
    expect(h.stored()).toBeNull()
    expect(h.events).toContain('disconnected Acme Robotics by null')
  })

  it('never calls Cloud unless connecting or connected @SC-1087', async () => {
    const h = harness()
    await h.connection.state()
    expect(await h.connection.accessToken()).toBeNull()
    expect(await h.connection.disconnect('u-sam')).toBe(false)
    await h.advance(600_000)
    expect(h.cloud.requests).toEqual([])
  })

  it('an approval page off Cloud\'s origin is refused, and nothing waits @SC-1086', async () => {
    const h = harness()
    h.cloud.answerNextWith({ status: 200, body: {
      device_code: 'GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS', user_code: 'WDJB-MJHT', verification_uri: 'https://evil.example/connect',
      verification_uri_complete: 'https://evil.example/connect?c=1', expires_in: 900, interval: 5,
    } })
    await expect(h.connection.connect('u-sam')).rejects.toThrow(/does not understand/)
    expect((await h.connection.state()).connecting).toBeNull()
  })
})

describe('Cloud connecting an hq it runs, with no code @SC-1124', () => {
  it('answers its key, made once, and asks nothing of Cloud for it', async () => {
    const h = harness()
    const first = await h.connection.keyForCloud()
    expect(first.publicKey).toBe(h.keys()!.publicKey)
    expect(first.hqAddress).toBe('https://hq.acme.example')
    expect(await h.connection.keyForCloud()).toEqual(first)
    expect(h.keysMade()).toBe(1)
    expect(h.cloud.requests).toEqual([])
  })

  it('keeps the connection only once the key signs for a token, which proves Cloud registered it', async () => {
    const h = harness()
    const { publicKey, clientId, hqAddress } = await h.connection.keyForCloud()
    await expect(h.connection.connectedByCloud({ cloudOrganisationId: 'org_42', name: 'Acme Robotics' })).rejects.toBeInstanceOf(CloudConnectionError)
    expect(h.stored()).toBeNull()
    h.cloud.registerForOrganisation(publicKey, clientId, hqAddress)
    const made = await h.connection.connectedByCloud({ cloudOrganisationId: 'org_42', name: 'Acme Robotics' })
    expect(made).toMatchObject({ cloudOrganisationId: 'org_42', name: 'Acme Robotics' })
    expect(h.stored()).toMatchObject({ clientId })
    expect(h.events).toEqual(['connected Acme Robotics by null'])
    expect(await h.connection.accessToken()).toBeTruthy()
  })

  it('asked again answers the same connection; another organisation, or a new key while connected, is refused', async () => {
    const h = harness()
    const { publicKey, clientId, hqAddress } = await h.connection.keyForCloud()
    h.cloud.registerForOrganisation(publicKey, clientId, hqAddress)
    const made = await h.connection.connectedByCloud({ cloudOrganisationId: 'org_42', name: 'Acme Robotics' })
    expect(await h.connection.connectedByCloud({ cloudOrganisationId: 'org_42', name: 'Acme Robotics' })).toEqual(made)
    await expect(h.connection.connectedByCloud({ cloudOrganisationId: 'org_7', name: 'Other' })).rejects.toBeInstanceOf(CloudConnectionError)
    await expect(h.connection.keyForCloud()).rejects.toBeInstanceOf(CloudConnectionError)
    expect(h.events).toEqual(['connected Acme Robotics by null'])
  })

  it("refuses to answer a key while hq's address is not one Cloud can send sign-ins back to @SC-1144", async () => {
    const h = harness()
    h.setAddress('https://hq.acme.example/?x=1')
    await expect(h.connection.keyForCloud()).rejects.toBeInstanceOf(CloudConnectionError)
  })

  it('without a key asked for first, nothing is connected and Cloud is not called', async () => {
    const h = harness()
    await expect(h.connection.connectedByCloud({ cloudOrganisationId: 'org_42', name: 'Acme Robotics' })).rejects.toBeInstanceOf(CloudConnectionError)
    expect(h.cloud.requests).toEqual([])
  })
})

describe('the stand-in refuses what Cloud must refuse @SC-1087', () => {
  it('a replayed assertion, and one signed by another key', async () => {
    const h = harness()
    const { userCode } = await h.connection.connect('u-sam')
    h.cloud.approve(userCode)
    await h.advance(5_000)
    const keys = h.keys()!
    const { signCloudClientAssertion } = await import('@agenthix/core/cloud-crypto')
    const assertion = await signCloudClientAssertion(keys, 'https://cloud.test/connect/token', Date.UTC(2026, 0, 1) + 5_000)
    const form = (a: string) => new URLSearchParams({
      grant_type: 'client_credentials', client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: a,
    }).toString()
    const send = (a: string) => h.cloud.fetch('https://cloud.test/connect/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-cloud-protocol-version': '1.0' }, body: form(a) })
    expect((await send(assertion)).status).toBe(200)
    expect((await send(assertion)).status).toBe(401)
    const other = await generateCloudConnectionKeys()
    const forged = await signCloudClientAssertion({ ...other, publicKey: keys.publicKey }, 'https://cloud.test/connect/token', Date.UTC(2026, 0, 1) + 5_000)
    expect((await send(forged)).status).toBe(401)
  })

  it('revoking a key Cloud no longer holds, or never did, still answers revoked', async () => {
    const h = harness()
    const { userCode } = await h.connection.connect('u-sam')
    h.cloud.approve(userCode)
    await h.advance(5_000)
    const client = cloudClient(h.cloud.base, h.cloud.fetch, () => Date.UTC(2026, 0, 1) + 5_000)
    await client.revoke(h.keys()!)
    await client.revoke(h.keys()!)
    await expect(client.revoke(await generateCloudConnectionKeys())).resolves.toBeUndefined()
  })

  it('a device code that lapsed', async () => {
    const h = harness({ expiresIn: 10 })
    const { userCode } = await h.connection.connect('u-sam')
    h.cloud.approve(userCode)
    h.setNow(Date.UTC(2026, 0, 1) + 11_000)
    const client = cloudClient(h.cloud.base, h.cloud.fetch, () => Date.UTC(2026, 0, 1) + 11_000)
    expect(await client.poll(h.keys()!, h.cloud.devices[0].deviceCode)).toEqual({ kind: 'expired' })
  })
})
