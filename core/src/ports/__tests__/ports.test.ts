import { describe, it, expect } from 'vitest'
import {
  ADDRESS_BLOCKS, AGENT_CONTAINER_BITS, AGENT_SLICE_BITS, CHOSEN_PORT_RANGE, CONTAINER_DATABASE_PORT,
  DEV_TAILSCALE_PORTS, PUBLISHED_DEFAULTS, SERVICE_PORTS,
} from '../ports.js'

const HUNDREDS = { hq: 41, site: 42, console: 43, relay: 44 } as const
const ROLES = { web: 0, server: 1, database: 9 } as const

function block(cidr: string): { start: number; end: number } {
  const [address, bits] = cidr.split('/')
  const start = address.split('.').reduce((n, part) => n * 256 + Number(part), 0)
  return { start, end: start + 2 ** (32 - Number(bits)) - 1 }
}

describe('ports @SC-1250', () => {
  it('gives each service its hundred and each role its last two digits', () => {
    for (const [service, roles] of Object.entries(SERVICE_PORTS)) {
      for (const [role, port] of Object.entries(roles)) {
        const hundred = HUNDREDS[service as keyof typeof HUNDREDS]
        expect(port, `${service}.${role}`).toBe(hundred * 100 + ROLES[role as keyof typeof ROLES])
      }
    }
  })

  it('uses no port twice', () => {
    const all = [
      ...Object.values(SERVICE_PORTS).flatMap(roles => Object.values(roles)),
      ...Object.values(DEV_TAILSCALE_PORTS),
      ...Object.values(PUBLISHED_DEFAULTS),
    ]
    expect(new Set(all).size).toBe(all.length)
  })

  it('keeps the published defaults choosable and away from our own hundreds', () => {
    for (const port of Object.values(PUBLISHED_DEFAULTS)) {
      expect(port).toBeGreaterThanOrEqual(CHOSEN_PORT_RANGE.first)
      expect(port).toBeLessThanOrEqual(CHOSEN_PORT_RANGE.last)
      expect(Object.values(HUNDREDS)).not.toContain(Math.floor(port / 100))
    }
    expect(CHOSEN_PORT_RANGE.last).toBeLessThan(32768)
    expect(CONTAINER_DATABASE_PORT).toBe(5432)
  })

  it('keeps the address blocks apart', () => {
    const blocks = Object.values(ADDRESS_BLOCKS).map(block)
    for (const [i, a] of blocks.entries()) {
      for (const b of blocks.slice(i + 1)) expect(a.end < b.start || b.end < a.start).toBe(true)
    }
  })

  it('cuts the agents block into sixteen slices of 512 agent containers', () => {
    const agentsBits = Number(ADDRESS_BLOCKS.agents.split('/')[1])
    expect(2 ** (AGENT_SLICE_BITS - agentsBits)).toBe(16)
    expect(2 ** (AGENT_CONTAINER_BITS - AGENT_SLICE_BITS)).toBe(512)
  })
})
