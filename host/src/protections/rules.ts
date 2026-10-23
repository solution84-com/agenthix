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
 * Nothing here has a setting, and no rule is ever left out (spec §8).
 */
import type { ProtectionRule } from '@agenthix/core'

/** The addresses a cloud provider's machine answers with its metadata and credentials. A short list, by name. */
export const METADATA_ADDRESSES: readonly string[] = [
  // AWS, Google Cloud, Azure, DigitalOcean, Oracle Cloud, Hetzner and most others: the link-local metadata service.
  '169.254.169.254',
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
}

export const RULES: readonly ProtectionRule[] = ['machine-ports', 'published-ports', 'metadata-address']

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
  return [
    `table inet ${rules.table}`,
    `delete table inet ${rules.table}`,
    `table inet ${rules.table} {`,
    '\tchain input {',
    '\t\ttype filter hook input priority -10; policy accept;',
    `\t\t${from} drop comment "machine-ports"`,
    '\t}',
    '\tchain forward {',
    '\t\ttype filter hook forward priority -10; policy accept;',
    `\t\t${from} ct direction original ct status dnat drop comment "published-ports"`,
    `\t\t${from} ip daddr { ${METADATA_ADDRESSES.join(', ')} } drop comment "metadata-address"`,
    ...machine,
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
  if (forward && drops('forward', 'metadata-address', ...METADATA_ADDRESSES.map(a => `"${a}"`))) inPlace.push('metadata-address')
  return inPlace
}
