import { describe, it, expect } from 'vitest'
import { checkProtocolCompatibility, peerRefusalMessage, protocolRefusalMessage } from '../compatibility.js'

describe('checkProtocolCompatibility @SC-291 @SC-1127', () => {
  it.each([
    // own, peer, how the peer stands, what this side speaks
    ['1.0', '1.0', 'same', { major: 1, minor: 0 }],
    ['1.3', '1.1', 'same', { major: 1, minor: 1 }],
    ['1.1', '1.3', 'same', { major: 1, minor: 1 }],
    ['3.2', '2.5', 'behind', { major: 2, minor: 5 }],
    ['3.2', '2.0', 'behind', { major: 2, minor: 0 }],
    ['2.5', '3.2', 'ahead', { major: 2, minor: 5 }],
    ['2.0', '3.9', 'ahead', { major: 2, minor: 0 }],
  ] as const)('own %s, peer %s: works, the peer %s', (own, peer, standing, speak) => {
    expect(checkProtocolCompatibility(own, peer)).toEqual({ ok: true, peer: standing, speak })
  })

  it.each([
    // Two or more majors apart is refused, and the side behind must upgrade, whatever the minors.
    ['3.0', '1.9', 'peer'],
    ['4.1', '1.0', 'peer'],
    ['1.9', '3.0', 'own'],
    ['1.0', '5.2', 'own'],
  ] as const)('own %s, peer %s: refused, %s must upgrade', (own, peer, upgrade) => {
    const [om, on] = own.split('.').map(Number)
    const [pm, pn] = peer.split('.').map(Number)
    expect(checkProtocolCompatibility(own, peer)).toEqual({
      ok: false, reason: 'too_far_apart', upgrade,
      own: { major: om, minor: on }, peer: { major: pm, minor: pn },
    })
  })

  it('repeats only the start of a malformed version that is long', () => {
    const c = checkProtocolCompatibility('1.0', 'x'.repeat(5000))
    expect(c).toMatchObject({ ok: false, reason: 'malformed', presented: `${'x'.repeat(32)}…` })
  })

  it('tells an absent peer version from a malformed one, so each caller chooses', () => {
    for (const absent of [undefined, null, '', '  ']) {
      expect(checkProtocolCompatibility('1.0', absent)).toEqual({ ok: false, reason: 'absent', own: { major: 1, minor: 0 } })
    }
    for (const junk of ['1', 'one.zero', '1.0.1', '1.', '.1', 'v1.0', '1.x', '-1.0']) {
      expect(checkProtocolCompatibility('1.0', junk)).toEqual({ ok: false, reason: 'malformed', own: { major: 1, minor: 0 }, presented: junk })
    }
  })

  it('accepts surrounding whitespace on the peer version, as a header may carry it', () => {
    expect(checkProtocolCompatibility('1.2', ' 1.1 ')).toEqual({ ok: true, peer: 'same', speak: { major: 1, minor: 1 } })
  })

  it('refuses, never throws, when the peer states a version that is not text, as a frame off the wire may', () => {
    for (const peer of [1, 1.2, true, {}, [], { trim: 1 }, { toString: 1 }]) {
      const c = checkProtocolCompatibility('1.2', peer)
      expect(c, JSON.stringify(peer)).toMatchObject({ ok: false, reason: 'malformed', own: { major: 1, minor: 2 } })
    }
    expect(checkProtocolCompatibility('1.2', null)).toMatchObject({ ok: false, reason: 'absent' })
  })

  it('throws on a malformed own version: that is ours, a programming error', () => {
    expect(() => checkProtocolCompatibility('1', '1.0')).toThrow(/major\.minor/)
  })
})

describe('protocolRefusalMessage @SC-1127', () => {
  const names = { own: 'this site', peer: 'HQ' }

  it('names both versions and the side that must upgrade', () => {
    const peerBehind = checkProtocolCompatibility('3.0', '1.4')
    const ownBehind = checkProtocolCompatibility('1.4', '3.0')
    if (peerBehind.ok || ownBehind.ok) throw new Error('expected refusals')
    expect(protocolRefusalMessage(peerBehind, names)).toBe(
      'HQ speaks protocol 1.4 and this site speaks 3.0, too far apart to work together: upgrade HQ.',
    )
    expect(protocolRefusalMessage(ownBehind, names)).toBe(
      'HQ speaks protocol 3.0 and this site speaks 1.4, too far apart to work together: upgrade this site.',
    )
  })

  it('says what was presented when the version cannot be read', () => {
    const absent = checkProtocolCompatibility('1.0', undefined)
    const junk = checkProtocolCompatibility('1.0', '1.x')
    if (absent.ok || junk.ok) throw new Error('expected refusals')
    expect(protocolRefusalMessage(absent, names)).toBe('HQ stated no protocol version; this site speaks 1.0.')
    expect(protocolRefusalMessage(junk, names)).toBe('HQ stated the protocol version "1.x", which is not one; this site speaks 1.0.')
  })
})

describe('peerRefusalMessage @SC-1127', () => {
  const names = { own: 'this site', peer: 'HQ' }

  it('says this side must upgrade when the peer is two or more majors ahead', () => {
    expect(peerRefusalMessage('1.0', '3.1', names)).toBe(
      'HQ speaks protocol 3.1 and this site speaks 1.0, too far apart to work together: upgrade this site.',
    )
  })

  it('says the peer must upgrade when it is two or more majors behind', () => {
    expect(peerRefusalMessage('3.2', '1.0', names)).toBe(
      'HQ speaks protocol 1.0 and this site speaks 3.2, too far apart to work together: upgrade HQ.',
    )
  })

  it('names neither side when the peer stated no version this side can read', () => {
    for (const stated of [undefined, null, '', '8.x']) {
      expect(peerRefusalMessage('1.0', stated, names)).toBe(
        "HQ refused this site's protocol 1.0 and stated no version of its own that this site can read.",
      )
    }
  })

  it('reports a refusal the rule would not make as it is', () => {
    expect(peerRefusalMessage('1.0', '1.4', names)).toBe("HQ speaks protocol 1.4 and refused this site's 1.0.")
  })
})
