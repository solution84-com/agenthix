/**
 * What the rules need to know about this machine (host-management spec §8, plan 2.14): whether the host service
 * shares the machine's network, so its firewall is the machine's; and, on Docker Desktop, the address of the
 * computer Docker runs on. There the containers run in a virtual machine: the input hook covers the virtual
 * machine's own ports, but the computer's are reached through `host.docker.internal`, which leaves it.
 */
import dns from 'node:dns/promises'
import fs from 'node:fs'
import os from 'node:os'
import { AGENT_NETWORK_RANGE } from '../compose/projects'
import { isIpv4, parseRange, tableFor } from './rules'
import type { RuleSource } from './protections'

/** The names Docker Desktop gives the computer it runs on. */
export const DESKTOP_HOST_NAMES = ['host.docker.internal', 'gateway.docker.internal']

export type MachineFacts = {
  /** The machine's network interfaces, by name. */
  interfaces: () => string[]
  /** The kernel's release, which names Docker Desktop's virtual machine. */
  kernel: () => string
  lookup: (name: string) => Promise<string[]>
}

export const realMachine: MachineFacts = {
  interfaces: () => {
    try {
      return fs.readdirSync('/sys/class/net')
    } catch {
      return Object.keys(os.networkInterfaces())
    }
  },
  kernel: () => os.release(),
  lookup: name => dns.lookup(name, { all: true, family: 4 }).then(r => r.map(a => a.address), () => []),
}

/** Docker's own bridges are in the machine's network and in no container's. */
export function sharesMachineNetwork(interfaces: string[]): boolean {
  return interfaces.some(i => i === 'docker0' || i.startsWith('br-'))
}

export function isDockerDesktop(kernel: string): boolean {
  return /linuxkit/i.test(kernel)
}

export function machineRules(namespace: string, facts: MachineFacts = realMachine): RuleSource {
  return async () => {
    if (!sharesMachineNetwork(facts.interfaces())) {
      return {
        problem: "The host service does not share this machine's network, so its firewall rules would not reach the agents. " +
          'Start its container with --network host, as the guide\'s command does.',
      }
    }
    const found = new Set<string>()
    for (const name of DESKTOP_HOST_NAMES) for (const a of await facts.lookup(name)) if (isIpv4(a) && !a.startsWith('127.')) found.add(a)
    if (isDockerDesktop(facts.kernel()) && found.size === 0) {
      return {
        problem: 'On Docker Desktop the host service could not find the address of the computer Docker runs on, ' +
          'so agents could reach it. Restart Docker Desktop, then the host service.',
      }
    }
    return { table: tableFor(namespace), range: parseRange(AGENT_NETWORK_RANGE), machineAddresses: [...found].sort() }
  }
}
