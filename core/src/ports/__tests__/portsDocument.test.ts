import { describe, it, expect } from 'vitest'
import document from '../../../../docs/architecture/ports.md?raw'
import {
  ADDRESS_BLOCKS, AGENT_CONTAINER_BITS, AGENT_SLICE_BITS, CHOSEN_PORT_RANGE, CONTAINER_DATABASE_PORT,
  DEV_TAILSCALE_PORTS, FRONT_DOOR_PORTS, HARNESS_PORTS, HQ_STANDARD_PORTS, LIVE_PREVIEW_PART_BITS, PUBLISHED_DEFAULTS,
  SERVICE_PORTS,
} from '../ports.js'

/** The rows of the first table after `<!-- ports:name -->`, each as its cells, header and rule rows left out. */
function tableAfter(name: string): string[][] {
  const lines = document.split('\n')
  const at = lines.indexOf(`<!-- ports:${name} -->`)
  if (at < 0) throw new Error(`docs/architecture/ports.md has no <!-- ports:${name} --> marker`)
  const rows: string[][] = []
  for (const line of lines.slice(at + 1)) {
    if (!line.startsWith('|')) {
      if (rows.length) break
      continue
    }
    rows.push(line.split('|').slice(1, -1).map(cell => cell.trim().replace(/`/g, '')))
  }
  return rows.slice(2)
}

const asPort = (cell: string) => (cell === '—' ? null : Number(cell))

describe('docs/architecture/ports.md @SC-1250', () => {
  it('lists the convention as the file has it', () => {
    const rows = tableAfter('convention')
    const written = Object.fromEntries(rows.map(([service, web, server, database]) =>
      [service.replace(/ \(\d+\)$/, '').replace('Fleet Console', 'console'), { web: asPort(web), server: asPort(server), database: asPort(database) }]))
    for (const [service, roles] of Object.entries(SERVICE_PORTS)) {
      const row = written[service] as Record<string, number | null>
      for (const role of ['web', 'server', 'database']) {
        expect(row[role], `${service}.${role}`).toBe((roles as Record<string, number | undefined>)[role] ?? null)
      }
    }
    expect(Object.keys(written).sort()).toEqual(Object.keys(SERVICE_PORTS).sort())
  })

  it('lists the constants as the file has them', () => {
    const expected: Record<string, string> = {
      CONTAINER_DATABASE_PORT: String(CONTAINER_DATABASE_PORT),
      'DEV_TAILSCALE_PORTS.hqWeb': String(DEV_TAILSCALE_PORTS.hqWeb),
      'DEV_TAILSCALE_PORTS.hqServer': String(DEV_TAILSCALE_PORTS.hqServer),
    }
    expect(Object.fromEntries(tableAfter('constants'))).toEqual(expected)
  })

  it("lists the harness's ports inside an agent's container", () => {
    expect(Object.fromEntries(tableAfter('harness'))).toEqual(
      Object.fromEntries(Object.entries(HARNESS_PORTS).map(([name, port]) => [`HARNESS_PORTS.${name}`, String(port)])))
  })

  it('lists the published defaults', () => {
    const rows = Object.fromEntries(tableAfter('published'))
    expect(rows).toEqual({ hq: String(PUBLISHED_DEFAULTS.hq), 'Fleet Console': String(PUBLISHED_DEFAULTS.console) })
  })

  it('lists what may be chosen', () => {
    expect(Object.fromEntries(tableAfter('range'))).toEqual({
      'CHOSEN_PORT_RANGE.first': String(CHOSEN_PORT_RANGE.first),
      'CHOSEN_PORT_RANGE.last': String(CHOSEN_PORT_RANGE.last),
      HQ_STANDARD_PORTS: HQ_STANDARD_PORTS.join(', '),
      FRONT_DOOR_PORTS: FRONT_DOOR_PORTS.join(', '),
    })
  })

  it('lists the address blocks', () => {
    const written = Object.fromEntries(tableAfter('blocks').map(([name, block]) => [name, block]))
    expect(written).toEqual(ADDRESS_BLOCKS)
  })

  it('lists the slice sizes', () => {
    expect(Object.fromEntries(tableAfter('slice'))).toEqual({
      AGENT_SLICE_BITS: String(AGENT_SLICE_BITS),
      AGENT_CONTAINER_BITS: String(AGENT_CONTAINER_BITS),
      LIVE_PREVIEW_PART_BITS: String(LIVE_PREVIEW_PART_BITS),
    })
  })

  it('states what the slice sizes come to', () => {
    const agentsBits = Number(ADDRESS_BLOCKS.agents.split('/')[1])
    expect(document).toContain(`${(2 ** (32 - AGENT_SLICE_BITS)).toLocaleString('en')} addresses`)
    expect(document).toContain(`${2 ** (AGENT_SLICE_BITS - agentsBits)} slices`)
    expect(document).toContain(`${2 ** (AGENT_CONTAINER_BITS - AGENT_SLICE_BITS)} agent containers`)
    expect(document).toContain(
      `${(2 ** (32 - LIVE_PREVIEW_PART_BITS)).toLocaleString('en')} addresses, so ${2 ** (AGENT_CONTAINER_BITS - LIVE_PREVIEW_PART_BITS)} live-preview networks`)
  })
})
