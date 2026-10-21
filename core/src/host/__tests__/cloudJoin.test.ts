import { beforeAll, describe, expect, it } from 'vitest'
import {
  cloudJoinBinding, cloudJoinLookup, consoleJoinBinding, fingerprintOf, generateHostKeys, generateJoinCode,
  hostCloudJoinBinding, hostJoinBinding, joinLookup, verifyCloudJoinBinding, verifyConsoleJoinBinding,
  verifyHostCloudJoinBinding, verifyHostJoinBinding, type HostKeys,
} from '../crypto/index.js'
import { parseCloudJoinAcceptance } from '../join.js'

let host: HostKeys
let cloud: HostKeys
let hostFp: string
let cloudFp: string
const code = generateJoinCode()

beforeAll(async () => {
  host = await generateHostKeys('host')
  cloud = await generateHostKeys('cloud')
  hostFp = await fingerprintOf(host.identity)
  cloudFp = await fingerprintOf(cloud.identity)
})

describe('enrolling with Cloud by a one-time code @SC-1079', () => {
  it('derives a lookup of its own, never a Fleet Console join\'s', async () => {
    const lookup = await cloudJoinLookup(code)
    expect(lookup).toMatch(/^[0-9a-f]{64}$/)
    expect(lookup).not.toBe(await joinLookup(code))
    expect(await cloudJoinLookup(code.toLowerCase())).toBe(lookup)
  })

  it('binds the machine and the machine id Cloud named it by', async () => {
    const binding = await hostCloudJoinBinding(code, hostFp, 'm-123')
    expect(await verifyHostCloudJoinBinding(code, hostFp, binding, 'm-123')).toBe(true)
    expect(await verifyHostCloudJoinBinding(code, hostFp, binding, 'm-124')).toBe(false)
    expect(await verifyHostCloudJoinBinding(code, hostFp, binding)).toBe(false)
    expect(await verifyHostCloudJoinBinding(generateJoinCode(), hostFp, binding, 'm-123')).toBe(false)
  })

  it('binds Cloud over both fingerprints and the machine id', async () => {
    const binding = await cloudJoinBinding(code, cloudFp, hostFp, 'm-123')
    expect(await verifyCloudJoinBinding(code, cloudFp, hostFp, 'm-123', binding)).toBe(true)
    expect(await verifyCloudJoinBinding(code, cloudFp, hostFp, 'm-999', binding)).toBe(false)
    expect(await verifyCloudJoinBinding(code, hostFp, cloudFp, 'm-123', binding)).toBe(false)
  })

  it('a Cloud code cannot be replayed as a Fleet Console join', async () => {
    const machine = await hostCloudJoinBinding(code, hostFp)
    expect(await verifyHostJoinBinding(code, hostFp, machine)).toBe(false)
    const controller = await cloudJoinBinding(code, cloudFp, hostFp, 'm-1')
    expect(await verifyConsoleJoinBinding(code, cloudFp, hostFp, controller)).toBe(false)
  })

  it('nor a Fleet Console join as a Cloud enrolment', async () => {
    const machine = await hostJoinBinding(code, hostFp)
    expect(await verifyHostCloudJoinBinding(code, hostFp, machine)).toBe(false)
    const controller = await consoleJoinBinding(code, cloudFp, hostFp)
    expect(await verifyCloudJoinBinding(code, cloudFp, hostFp, '', controller)).toBe(false)
  })
})

describe('Cloud\'s acceptance @SC-1079', () => {
  it('names a Cloud identity and a binding, and nothing else', async () => {
    const acceptance = { identity: cloud.identity, binding: 'b'.repeat(43) }
    expect(parseCloudJoinAcceptance({ ...acceptance, extra: 1 })).toEqual(acceptance)
    expect(parseCloudJoinAcceptance({ ...acceptance, identity: { ...cloud.identity, role: 'console' } })).toBeNull()
    expect(parseCloudJoinAcceptance({ identity: cloud.identity })).toBeNull()
    expect(parseCloudJoinAcceptance(null)).toBeNull()
  })
})
