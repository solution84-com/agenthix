/**
 * Whether a relay request came from its turn's container: exactly its address
 * where the site shares the container's network, and only this machine where
 * Docker Desktop's forwarder stands between them.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createSourceCheck, normaliseAddress, resetRelaySourceForTests } from '../relaySource'

let now = 0
const deps = (address: string | null, forwarded: boolean) => ({
  containerAddress: vi.fn(async () => address),
  forwardedByVm: vi.fn(async () => forwarded),
  now: () => now,
})

beforeEach(() => {
  resetRelaySourceForTests()
  now = 1_000_000
})

describe('on a network the site shares with the container (Linux, or a deployed site)', () => {
  it("accepts the container's own address, as an IPv4-mapped one too, and reads it once", async () => {
    const d = deps('10.213.0.3', false)
    const check = createSourceCheck(d)
    await expect(check('c1', '10.213.0.3')).resolves.toBe(true)
    await expect(check('c1', '::ffff:10.213.0.3')).resolves.toBe(true)
    expect(d.containerAddress).toHaveBeenCalledTimes(1)
  })

  it('refuses another container\'s address, and loopback', async () => {
    const check = createSourceCheck(deps('10.213.0.3', false))
    await expect(check('c1', '10.213.0.11')).resolves.toBe(false)
    now += 5_000
    await expect(check('c1', '127.0.0.1')).resolves.toBe(false)
    await expect(check('c1', undefined)).resolves.toBe(false)
  })

  it('reads the address again for a container recreated under the same name, but not on every refusal', async () => {
    const d = deps('10.213.0.3', false)
    const check = createSourceCheck(d)
    await check('c1', '10.213.0.3')
    d.containerAddress.mockResolvedValue('10.213.0.19')
    await expect(check('c1', '10.213.0.19')).resolves.toBe(false)
    now += 1_500
    await expect(check('c1', '10.213.0.19')).resolves.toBe(true)
    await expect(check('c1', '10.213.0.99')).resolves.toBe(false)
    expect(d.containerAddress).toHaveBeenCalledTimes(2)
  })

  it('refuses a container that has no address on its network', async () => {
    await expect(createSourceCheck(deps(null, false))('c1', '10.213.0.3')).resolves.toBe(false)
  })
})

describe('through a virtual machine\'s port forwarder (Docker Desktop, the site on the host)', () => {
  it('accepts a loopback source, where every container\'s request arrives', async () => {
    const check = createSourceCheck(deps('10.213.0.3', true))
    await expect(check('c1', '127.0.0.1')).resolves.toBe(true)
    await expect(check('c1', '::ffff:127.0.0.1')).resolves.toBe(true)
  })

  it('still refuses any other address', async () => {
    const check = createSourceCheck(deps('10.213.0.3', true))
    await expect(check('c1', '192.168.1.20')).resolves.toBe(false)
  })
})

it('reads an address as one, however it is written', () => {
  expect(normaliseAddress('::ffff:10.0.0.1')).toBe('10.0.0.1')
  expect(normaliseAddress('fe80::1')).toBe('fe80::1')
  expect(normaliseAddress(undefined)).toBe('')
})
