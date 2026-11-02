import { describe, it, expect } from 'vitest'
import {
  CLIENT_PROTOCOL_HANDSHAKE_FIELD, CLIENT_PROTOCOL_REFUSED, CLIENT_PROTOCOL_VERSION, CLIENT_PROTOCOL_VERSION_HEADER,
  decideClientProtocol,
} from '../index.js'

describe('the client protocol @SC-1130', () => {
  it('is 1.9, with its own header and handshake field', () => {
    expect(CLIENT_PROTOCOL_VERSION).toBe('1.9')
    expect(CLIENT_PROTOCOL_VERSION_HEADER).toBe('X-Client-Protocol-Version')
    expect(CLIENT_PROTOCOL_HANDSHAKE_FIELD).toBe('clientProtocolVersion')
    expect(CLIENT_PROTOCOL_REFUSED).toBe('client_protocol_refused')
  })

  it.each([undefined, null, '', '  '])('serves a client that states no version (%j)', (presented) => {
    expect(decideClientProtocol(presented)).toEqual({ ok: true, clientVersion: null })
  })

  it.each([
    // hq, the app
    ['1.0', '1.0'],
    ['1.0', '1.9'],
    ['2.3', '1.0'],
    ['2.0', '3.4'],
  ])('hq on %s serves an app on %s: the same major or one apart', (own, presented) => {
    expect(decideClientProtocol(presented, own)).toEqual({ ok: true, clientVersion: presented })
  })

  it('refuses an app two majors behind, naming the app as the side to update', () => {
    expect(decideClientProtocol('1.4', '3.0')).toEqual({
      ok: false,
      refusal: {
        error: 'This app speaks protocol 1.4 and HQ speaks 3.0, too far apart to work together: upgrade this app.',
        reason: 'too_far_apart', hqVersion: '3.0', clientVersion: '1.4', upgrade: 'client',
      },
    })
  })

  it('refuses an app two majors ahead, naming HQ as the side to update', () => {
    expect(decideClientProtocol('3.1', '1.0')).toEqual({
      ok: false,
      refusal: {
        error: 'This app speaks protocol 3.1 and HQ speaks 1.0, too far apart to work together: upgrade HQ.',
        reason: 'too_far_apart', hqVersion: '1.0', clientVersion: '3.1', upgrade: 'hq',
      },
    })
  })

  it.each(['1', 'one', '1.0.0', 'v1.0'])('refuses a version it cannot read (%j) as the app to update', (presented) => {
    expect(decideClientProtocol(presented)).toEqual({
      ok: false,
      refusal: {
        error: `This app stated the protocol version ${JSON.stringify(presented)}, which is not one; HQ speaks 1.9.`,
        reason: 'malformed', hqVersion: '1.9', clientVersion: presented, upgrade: 'client',
      },
    })
  })
})
