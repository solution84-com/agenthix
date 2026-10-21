/** What `nft -j list table inet <table>` prints for the rules `nftScript` applies — the stand-in for nft in tests. */
import { METADATA_ADDRESSES, type RuleSet } from '../rules'

const from = (set: RuleSet) => ({ match: { op: '==', left: { payload: { protocol: 'ip', field: 'saddr' } }, right: { prefix: { addr: set.range.addr, len: set.range.len } } } })
const to = (addr: unknown) => ({ match: { op: '==', left: { payload: { protocol: 'ip', field: 'daddr' } }, right: addr } })
const ct = (key: string, right: string, op = '==') => ({ match: { op, left: { ct: { key } }, right } })

export function listing(set: RuleSet, drop: { without?: string[]; metadata?: string[] } = {}): string {
  const chain = (name: string) => ({ chain: { family: 'inet', table: set.table, name, handle: 1, type: 'filter', hook: name, prio: -10, policy: 'accept' } })
  const rule = (chain: string, comment: string, ...expr: unknown[]) => ({ rule: { family: 'inet', table: set.table, chain, handle: 2, comment, expr: [...expr, { drop: null }] } })
  const items: unknown[] = [
    { metainfo: { version: '1.1.1', json_schema_version: 1 } },
    { table: { family: 'inet', name: set.table, handle: 9 } },
    chain('input'),
    rule('input', 'machine-ports', from(set)),
    chain('forward'),
    rule('forward', 'published-ports', from(set), ct('direction', 'original'), ct('status', 'dnat', 'in')),
    rule('forward', 'metadata-address', from(set), to({ set: drop.metadata ?? [...METADATA_ADDRESSES] })),
  ]
  if (set.machineAddresses.length) {
    items.push(rule('forward', 'machine-ports', from(set), to(set.machineAddresses.length === 1 ? set.machineAddresses[0] : { set: set.machineAddresses })))
  }
  const kept = items.filter(i => !drop.without?.includes((i as { rule?: { comment?: string; chain?: string } }).rule?.comment ?? ''))
  return JSON.stringify({ nftables: kept })
}
