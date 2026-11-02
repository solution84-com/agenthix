/** IPv6 off in every container the site makes for agents, steps and sign-in, unless the kernel has none. */
import { afterEach, describe, expect, it } from 'vitest'
import { ipv6OffArgs, ipv6OffSysctls, setKernelIpv6ForTests, sysctlsMatch } from '../ipv6Off'

afterEach(() => setKernelIpv6ForTests(null))

describe('IPv6 off in a container @SC-1734', () => {
  it('turns it off on every interface the container has and every one it gets later', () => {
    setKernelIpv6ForTests(true)
    expect(ipv6OffSysctls()).toEqual({ 'net.ipv6.conf.all.disable_ipv6': '1', 'net.ipv6.conf.default.disable_ipv6': '1' })
    expect(ipv6OffArgs()).toEqual(['--sysctl', 'net.ipv6.conf.all.disable_ipv6=1', '--sysctl', 'net.ipv6.conf.default.disable_ipv6=1'])
  })

  it('asks nothing on a kernel without IPv6, where Docker would refuse the setting', () => {
    setKernelIpv6ForTests(false)
    expect(ipv6OffSysctls()).toEqual({})
    expect(ipv6OffArgs()).toEqual([])
  })

  it('holds what Docker reports to exactly the settings asked', () => {
    const want = { 'net.ipv6.conf.all.disable_ipv6': '1', 'net.ipv6.conf.default.disable_ipv6': '1' }
    expect(sysctlsMatch({ ...want }, want)).toBe(true)
    expect(sysctlsMatch(null, want)).toBe(false)
    expect(sysctlsMatch({ 'net.ipv6.conf.all.disable_ipv6': '1' }, want)).toBe(false)
    expect(sysctlsMatch({ ...want, 'net.ipv6.conf.all.disable_ipv6': '0' }, want)).toBe(false)
    expect(sysctlsMatch({ ...want, 'net.ipv4.ip_forward': '1' }, want)).toBe(false)
    expect(sysctlsMatch(null, {})).toBe(true)
    expect(sysctlsMatch(['x'], {})).toBe(false)
  })
})
