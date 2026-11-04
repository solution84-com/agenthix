/**
 * The agent protections' firewall rules (host-management spec §8, the diagram *Agent protections*): for traffic
 * from the address range agent networks use, the machine's own ports, ports other containers publish on it, and
 * the provider's metadata address are shut. Ordinary internet access stays, and so does the one thing an agent
 * reaches on purpose, its site, which shares its private network (ADR-0066).
 *
 * The rules live in an nftables table of their own, hooked before Docker's filter chains. A packet one table
 * drops is dropped whatever another table accepts, so the rules hold the same whether Docker writes its own rules
 * with iptables (legacy or nft) or with nftables, and Docker never flushes a table it did not make. The table is
 * replaced whole, in one transaction, so it is never half applied.
 *
 * - `machine-ports`: anything an agent sends to one of the machine's own addresses (the input hook) — sshd, a
 *   database or an admin panel listening on every interface, its network's gateway — and, on Docker Desktop, to the
 *   computer Docker runs on.
 * - `published-ports`: a connection Docker redirected (destination NAT) to a port another container publishes.
 * - `metadata-address`: the cloud providers' metadata addresses (`METADATA_ADDRESSES`), which hand out the
 *   machine's cloud credentials.
 *
 * A live preview, on any machine, reaches the public internet and its own site and services, and nothing else (live
 * preview spec section 6). For the live-preview part of the range (the site makes every live preview's networks
 * there, core's `livePreviewPartOf`), two rules more, each counting what it drops by address in a set of its own
 * (`drops_<rule>`), which the site's guard reads as a rate:
 *
 * - `private-addresses`: every address that is not the public internet (`NOT_PUBLIC`: the private ranges, a router
 *   and its network, a cloud's private network, tailnets, carrier NAT, loopback, link-local, multicast and the
 *   reserved ranges). Only the part itself is left out, where each live preview's own network holds its site and its
 *   services; one network reaching another is Docker's isolation between networks.
 * - `public-address`: the public addresses the machine is seen from, written once one is known: a router whose
 *   forwarded ports lead back into its network.
 *
 * Ordinary agents keep reaching private addresses (ADR-0066). Nothing here has a setting, and no rule is ever left out
 * (spec §8).
 */
import type { ProtectionRule } from '@agenthix/core'

/**
 * What an ordinary agent is refused in addition to the machine's ports: the whole link-local range, where every
 * cloud provider puts its metadata and credential services (AWS, Google Cloud, Azure, Tencent Cloud, container task
 * credentials and others), and the two addresses outside it that providers use. A range, so no provider's address
 * has to be known by name.
 */
export const METADATA_ADDRESSES: readonly string[] = [
  '169.254.0.0/16',
  // Azure: the WireServer, which hands a machine its configuration and certificates.
  '168.63.129.16',
  // Alibaba Cloud: its metadata service.
  '100.100.100.200',
]

export type RuleSet = {
  /** The nftables table, derived from the install's namespace. */
  table: string
  /** The installation's agent slice (`compose/agentSlice.ts`), which its site gives as `AGENT_NETWORK_RANGE`. */
  range: { addr: string; len: number }
  /**
   * Further addresses of the machine an agent must not reach: on Docker Desktop, the computer Docker runs on,
   * which is outside the virtual machine the input hook covers. Empty elsewhere.
   */
  machineAddresses: string[]
  /** The live-preview part of the range, and the public addresses the machine is seen from; absent where it has none. */
  livePreview?: { part: { addr: string; len: number }; publicAddresses: string[] }
}

export const RULES: readonly ProtectionRule[] = ['machine-ports', 'published-ports', 'metadata-address']

/** Every rule written for this machine: `public-address` only once an address is known. */
export function rulesFor(set: RuleSet): readonly ProtectionRule[] {
  if (!set.livePreview) return RULES
  return [...RULES, 'private-addresses', ...(set.livePreview.publicAddresses.length ? ['public-address' as const] : [])]
}

/**
 * Every IPv4 range that is not the public internet: this network, the private ranges, the shared range tailnets and
 * carrier NAT use, loopback, link-local, the protocol assignments, the benchmarking range, and multicast with the
 * reserved range above it. Written so no two touch, so nft keeps them as written.
 */
export const NOT_PUBLIC: readonly string[] = [
  '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12',
  '192.0.0.0/24', '192.168.0.0/16', '198.18.0.0/15', '224.0.0.0/3',
]

/** The set that counts one rule's drops by address. */
export const dropSetFor = (rule: ProtectionRule): string => `drops_${rule.replace(/-/g, '_')}`

function livePreviewLines(rules: RuleSet): { sets: string[]; forward: string[] } {
  const lp = rules.livePreview
  if (!lp) return { sets: [], forward: [] }
  const part = `${lp.part.addr}/${lp.part.len}`
  if (!isIpv4(lp.part.addr)) throw new Error(`${part} is not an IPv4 range.`)
  for (const a of lp.publicAddresses) if (!isIpv4(a)) throw new Error(`${a} is not an IPv4 address.`)
  const count = (rule: ProtectionRule) => `update @${dropSetFor(rule)} { ip saddr counter } drop comment "${rule}"`
  const written = rulesFor(rules).filter(r => r === 'private-addresses' || r === 'public-address')
  return {
    sets: written.map(r => `\tset ${dropSetFor(r)} { type ipv4_addr; size 65535; flags dynamic; }`),
    forward: [
      `\t\tip saddr ${part} ip daddr != ${part} ip daddr { ${NOT_PUBLIC.join(', ')} } ${count('private-addresses')}`,
      ...(lp.publicAddresses.length ? [`\t\tip saddr ${part} ip daddr { ${lp.publicAddresses.join(', ')} } ${count('public-address')}`] : []),
    ],
  }
}

/** An entry of `METADATA_ADDRESSES` as `nft -j` prints it: a bare address, or a prefix object for a range. */
const asListed = (entry: string): string => {
  const [addr, len] = entry.split('/')
  return len === undefined ? `"${addr}"` : `{"prefix":{"addr":"${addr}","len":${len}}}`
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

export function isIpv4(value: string): boolean {
  const m = IPV4.exec(value)
  return !!m && m.slice(1).every(o => Number(o) <= 255)
}

export function parseRange(range: string): RuleSet['range'] {
  const [addr, bits] = range.trim().split('/')
  const len = Number(bits)
  if (!addr || !isIpv4(addr) || !Number.isInteger(len) || len < 8 || len > 29) {
    throw new Error(`The agents' address range ${range} is not an IPv4 range like 10.213.0.0/20.`)
  }
  return { addr, len }
}

export function tableFor(namespace: string): string {
  return `${namespace.replace(/[^a-z0-9]/g, '_')}_agents`
}

/** The script `nft -f -` reads: the table made if missing, deleted, and made again whole — one transaction. */
export function nftScript(rules: RuleSet): string {
  const from = `ip saddr ${rules.range.addr}/${rules.range.len}`
  for (const a of rules.machineAddresses) if (!isIpv4(a)) throw new Error(`${a} is not an IPv4 address.`)
  const machine = rules.machineAddresses.length
    ? [`\t\t${from} ip daddr { ${rules.machineAddresses.join(', ')} } drop comment "machine-ports"`]
    : []
  const lp = livePreviewLines(rules)
  return [
    `table inet ${rules.table}`,
    `delete table inet ${rules.table}`,
    `table inet ${rules.table} {`,
    ...lp.sets,
    '\tchain input {',
    '\t\ttype filter hook input priority -10; policy accept;',
    `\t\t${from} drop comment "machine-ports"`,
    '\t}',
    '\tchain forward {',
    '\t\ttype filter hook forward priority -10; policy accept;',
    `\t\t${from} ct direction original ct status dnat drop comment "published-ports"`,
    `\t\t${from} ip daddr { ${METADATA_ADDRESSES.join(', ')} } drop comment "metadata-address"`,
    ...machine,
    ...lp.forward,
    '\t}',
    '}',
    '',
  ].join('\n')
}

type NftItem = {
  chain?: { table?: string; name?: string; hook?: string; type?: string; policy?: string }
  rule?: { table?: string; chain?: string; comment?: string; expr?: unknown[] }
}

/**
 * Which rules hold, read from `nft -j list table inet <table>`: each is in its chain, the chain on its hook, the
 * rule from the agents' range and ending in a drop. A rule anyone changed, or a chain that lost its hook, does not
 * count — the protections hold only when all of them do.
 */
export function rulesInPlace(listing: string, rules: RuleSet): ProtectionRule[] {
  let items: NftItem[]
  try {
    items = ((JSON.parse(listing) as { nftables?: NftItem[] }).nftables ?? [])
  } catch {
    return []
  }
  const hooked = (name: string) => items.some(i =>
    i.chain?.table === rules.table && i.chain.name === name && i.chain.hook === name && i.chain.type === 'filter' && i.chain.policy === 'accept')
  const fromRange = `{"prefix":{"addr":"${rules.range.addr}","len":${rules.range.len}}}`
  const drops = (chain: string, comment: string, ...must: string[]) => items.filter(i => {
    const r = i.rule
    if (!r || r.table !== rules.table || r.chain !== chain || r.comment !== comment || !Array.isArray(r.expr)) return false
    const expr = JSON.stringify(r.expr)
    return expr.includes(fromRange) && JSON.stringify(r.expr[r.expr.length - 1]) === '{"drop":null}' && must.every(m => expr.includes(m))
  }).length > 0

  const inPlace: ProtectionRule[] = []
  const input = hooked('input')
  const forward = hooked('forward')
  const machineElsewhere = rules.machineAddresses.every(a => forward && drops('forward', 'machine-ports', `"${a}"`))
  if (input && drops('input', 'machine-ports') && machineElsewhere) inPlace.push('machine-ports')
  if (forward && drops('forward', 'published-ports', '"dnat"', '"original"')) inPlace.push('published-ports')
  if (forward && drops('forward', 'metadata-address', ...METADATA_ADDRESSES.map(asListed))) inPlace.push('metadata-address')
  const lp = rules.livePreview
  if (lp && forward) {
    const fromPart = `{"prefix":{"addr":"${lp.part.addr}","len":${lp.part.len}}}`
    const counted = (comment: ProtectionRule, ...must: string[]) => items.some(i => {
      const r = i.rule
      if (!r || r.table !== rules.table || r.chain !== 'forward' || r.comment !== comment || !Array.isArray(r.expr)) return false
      const expr = JSON.stringify(r.expr)
      return expr.includes(fromPart) && JSON.stringify(r.expr[r.expr.length - 1]) === '{"drop":null}' && must.every(m => expr.includes(m))
    })
    const ranges = NOT_PUBLIC.map(c => { const [addr, len] = c.split('/'); return `{"prefix":{"addr":"${addr}","len":${len}}}` })
    // nft names the set a rule updates with its @, as the script writes it.
    if (counted('private-addresses', `"@${dropSetFor('private-addresses')}"`, ...ranges)) inPlace.push('private-addresses')
    if (lp.publicAddresses.length && counted('public-address', `"@${dropSetFor('public-address')}"`, ...lp.publicAddresses.map(a => `"${a}"`))) {
      inPlace.push('public-address')
    }
  }
  return inPlace
}
