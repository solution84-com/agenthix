import { describe, expect, it } from 'vitest'
import { HOST_PROTOCOL_VERSION, parseProtocolVersion } from '@agenthix/core'
import { parseFrame } from '../frames'

const { major } = parseProtocolVersion(HOST_PROTOCOL_VERSION)!
const raw = (version: unknown) => JSON.stringify({ version, type: 'host.ping', payload: {} })

describe('parseFrame @SC-1129', () => {
  it('reads a frame of this major, or one major apart', () => {
    for (const version of [HOST_PROTOCOL_VERSION, `${major}.99`, `${major + 1}.0`]) {
      expect(parseFrame(raw(version))).toMatchObject({ version, type: 'host.ping' })
    }
  })

  it('drops a frame two or more majors apart, or without a readable version', () => {
    for (const version of [`${major + 2}.0`, `${major + 3}.4`, 'one', '', undefined, 1]) {
      expect(parseFrame(raw(version))).toBeNull()
    }
  })
})
