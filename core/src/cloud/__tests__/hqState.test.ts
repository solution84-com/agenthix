import { describe, expect, it } from 'vitest'
import { parseHqCloudState } from '../hqState.js'

const connecting = { userCode: 'WDJB-MJHT', verificationUri: 'https://cloud.example.com/connect', verificationUriComplete: 'https://cloud.example.com/connect?user_code=WDJB-MJHT', expiresAt: '2026-01-01T00:15:00.000Z' }
const connection = { cloudOrganisationId: 'org_42', name: 'Acme Robotics', connectedAt: '2026-01-01T00:00:00.000Z' }

describe("hq's connection to Cloud, as the Fleet Console reads it @SC-1083", () => {
  it('takes each state hq answers', () => {
    const none = { connection: null, connecting: null, lastAttempt: null, runByCloud: false }
    expect(parseHqCloudState(none)).toEqual({ ...none, problem: null })
    expect(parseHqCloudState({ ...none, connecting })?.connecting).toEqual(connecting)
    expect(parseHqCloudState({ ...none, connection })?.connection).toEqual(connection)
    expect(parseHqCloudState({ ...none, lastAttempt: 'refused' })?.lastAttempt).toBe('refused')
  })

  it('reads whether Cloud runs hq, which hq always says @SC-1123', () => {
    expect(parseHqCloudState({ connection, connecting: null, lastAttempt: null, runByCloud: true })?.runByCloud).toBe(true)
    expect(parseHqCloudState({ connection: null, connecting: null, lastAttempt: null, runByCloud: false })?.runByCloud).toBe(false)
    expect(parseHqCloudState({ connection: null, connecting: null, lastAttempt: null, runByCloud: 'yes' })).toBeNull()
    expect(parseHqCloudState({ connection: null, connecting: null, lastAttempt: null })).toBeNull()
  })

  it('reads why hq\'s calls to Cloud are refused for the protocol, and nothing when it says none or something unreadable @SC-1169', () => {
    const none = { connection, connecting: null, lastAttempt: null, runByCloud: false }
    const why = 'Agenthix Cloud speaks protocol 3.0 and this HQ speaks 1.0, too far apart to work together: upgrade this HQ.'
    expect(parseHqCloudState({ ...none, problem: why })?.problem).toBe(why)
    expect(parseHqCloudState({ ...none, problem: null })?.problem).toBeNull()
    expect(parseHqCloudState(none)?.problem).toBeNull()
    expect(parseHqCloudState({ ...none, problem: 7 })?.problem).toBeNull()
  })

  it('shows nothing of an answer that is not the shape', () => {
    expect(parseHqCloudState({ connection: null, connecting: { ...connecting, userCode: 'hello' }, lastAttempt: null })).toBeNull()
    expect(parseHqCloudState({ connection: { ...connection, cloudOrganisationId: 'org:42' }, connecting: null, lastAttempt: null, runByCloud: false })).toBeNull()
    expect(parseHqCloudState({ connection: null, connecting: { ...connecting, verificationUri: 'javascript:alert(1)' }, lastAttempt: null })).toBeNull()
    expect(parseHqCloudState({ connection: { ...connection, name: '' }, connecting: null, lastAttempt: null })).toBeNull()
    expect(parseHqCloudState({ connection: null, connecting: null, lastAttempt: 'maybe' })).toBeNull()
    expect(parseHqCloudState('nope')).toBeNull()
  })
})
