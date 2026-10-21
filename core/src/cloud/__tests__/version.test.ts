import { describe, expect, it } from 'vitest'
import {
  CLOUD_PROTOCOL_VERSION, CLOUD_PROTOCOL_VERSION_HEADER, CLOUD_UPGRADE_REQUIRED_STATUS, checkCloudAnswerProtocol, checkHqCloudProtocol,
} from '../version.js'

describe('the Cloud protocol version @SC-1131', () => {
  it('is 1.0 at the baseline, in its own header, refused with 426', () => {
    expect(CLOUD_PROTOCOL_VERSION).toBe('1.0')
    expect(CLOUD_PROTOCOL_VERSION_HEADER).toBe('X-Cloud-Protocol-Version')
    expect(CLOUD_UPGRADE_REQUIRED_STATUS).toBe(426)
  })

  it("Cloud's side: serves hq one major apart or less, and refuses one that states none, an unreadable one, or one two apart", () => {
    expect(checkHqCloudProtocol('1.0')).toMatchObject({ ok: true, peer: 'same' })
    expect(checkHqCloudProtocol('1.7')).toMatchObject({ ok: true, peer: 'same' })
    expect(checkHqCloudProtocol('2.3')).toMatchObject({ ok: true, peer: 'ahead' })
    expect(checkHqCloudProtocol(undefined)).toMatchObject({ ok: false, reason: 'absent' })
    expect(checkHqCloudProtocol('')).toMatchObject({ ok: false, reason: 'absent' })
    expect(checkHqCloudProtocol('one')).toMatchObject({ ok: false, reason: 'malformed' })
    expect(checkHqCloudProtocol('3.0')).toMatchObject({ ok: false, reason: 'too_far_apart', upgrade: 'own' })
  })

  it("hq's side: an answer without the header is read as 1.0; one two majors apart is refused, naming who upgrades", () => {
    expect(checkCloudAnswerProtocol(null)).toMatchObject({ ok: true, peer: 'same' })
    expect(checkCloudAnswerProtocol('  ')).toMatchObject({ ok: true, peer: 'same' })
    expect(checkCloudAnswerProtocol('2.0')).toMatchObject({ ok: true, peer: 'ahead' })
    expect(checkCloudAnswerProtocol('3.1')).toEqual({
      ok: false, reason: 'too_far_apart', own: { major: 1, minor: 0 }, peer: { major: 3, minor: 1 }, upgrade: 'own',
    })
    expect(checkCloudAnswerProtocol('v1')).toMatchObject({ ok: false, reason: 'malformed', presented: 'v1' })
  })
})
