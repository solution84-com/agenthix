/**
 * IPv6 off inside every container the site makes for agents, workflow steps and sign-in. Their networks are IPv4 only
 * (`containerNetwork.ts`), and the host service's protections are written for IPv4; the kernel would still take an
 * IPv6 address the moment a network gave one, and a link-local one reaches the machine's own ports. So each container
 * is made with IPv6 off on every interface it has and every one it gets later, and nothing is left
 * to Docker's defaults.
 *
 * A Linux kernel started without IPv6 has no such settings, and Docker refuses a container that names them: there,
 * nothing is asked, since nothing can carry IPv6.
 */
import { existsSync } from 'node:fs'

const IPV6_OFF: Readonly<Record<string, string>> = {
  'net.ipv6.conf.all.disable_ipv6': '1',
  'net.ipv6.conf.default.disable_ipv6': '1',
}

let kernelHasIpv6: boolean | null = null

/** Whether the kernel Docker runs on has IPv6: on Linux the site shares it; Docker Desktop's own always has. */
function hasIpv6(): boolean {
  if (kernelHasIpv6 === null) kernelHasIpv6 = process.platform !== 'linux' || existsSync('/proc/sys/net/ipv6')
  return kernelHasIpv6
}

export function setKernelIpv6ForTests(has: boolean | null): void {
  kernelHasIpv6 = has
}

/** The kernel settings every such container is made with, as `docker inspect` reports them (`HostConfig.Sysctls`). */
export function ipv6OffSysctls(): Record<string, string> {
  return hasIpv6() ? { ...IPV6_OFF } : {}
}

export function sysctlArgs(sysctls: Record<string, string>): string[] {
  return Object.entries(sysctls).flatMap(([k, v]) => ['--sysctl', `${k}=${v}`])
}

/** `--sysctl` arguments that turn IPv6 off, for a container made outside a template. */
export function ipv6OffArgs(): string[] {
  return sysctlArgs(ipv6OffSysctls())
}

/** Whether Docker's `HostConfig.Sysctls` is exactly `expected`: none missing, none changed, none added. */
export function sysctlsMatch(actual: unknown, expected: Record<string, string>): boolean {
  const a = actual === null || actual === undefined ? {} : actual
  if (typeof a !== 'object' || Array.isArray(a)) return false
  const entries = Object.entries(a as Record<string, unknown>)
  return entries.length === Object.keys(expected).length && entries.every(([k, v]) => expected[k] === v)
}
