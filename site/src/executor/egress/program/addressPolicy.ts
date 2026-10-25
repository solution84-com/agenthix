/**
 * Which addresses the proxy never connects to unless that exact address was approved (workflows spec part 2,
 * *The containers* D): every address that isn't on the public internet — private, loopback, link-local, shared
 * (carrier-grade NAT), documentation, multicast and reserved blocks, the cloud providers' metadata addresses, and
 * the IPv6 forms that carry an IPv4 address inside them. The site, hq, the machine's other services and a cloud's
 * credentials all live there. Checked on each address after the proxy resolves a name, and the proxy connects to
 * that checked address, so a name can't be re-pointed between the check and the connection.
 *
 * Part of the proxy's program, which runs from these functions' source text: each may use only its arguments,
 * Node's globals and the program's other functions.
 */
export function makeNonPublicCheck(net: typeof import('node:net')): (address: string) => boolean {
  const v4 = [
    '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24',
    '192.0.2.0/24', '192.88.99.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24',
    '224.0.0.0/4', '240.0.0.0/4',
    // Azure's WireServer, which hands a machine its configuration, at a public address.
    '168.63.129.16/32',
  ]
  const v6 = [
    '::/128', '::1/128', '::ffff:0:0/96', '64:ff9b::/96', '64:ff9b:1::/48', '100::/64', '2001::/23', '2001:db8::/32',
    '2002::/16', '3fff::/20', '5f00::/16', 'fc00::/7', 'fe80::/10', 'fec0::/10', 'ff00::/8',
  ]
  // One list per family: Node checks an IPv4 address against a list's IPv6 rules too, as if mapped, so
  // `::ffff:0:0/96` in a shared list would refuse every IPv4 address.
  const list = (ranges: string[], family: 'ipv4' | 'ipv6') => {
    const l = new net.BlockList()
    for (const r of ranges) { const [a, bits] = r.split('/'); l.addSubnet(a!, Number(bits), family) }
    return l
  }
  const lists = { 4: list(v4, 'ipv4'), 6: list(v6, 'ipv6') }
  return (address: string): boolean => {
    const a = normaliseAddress(address)
    const family = net.isIP(a)
    if (family === 0) return true
    return family === 4 ? lists[4].check(a, 'ipv4') : lists[6].check(a, 'ipv6')
  }
}

/** An address in one written form: brackets gone, IPv6 compressed and lower case. */
export function normaliseAddress(address: string): string {
  const a = address.trim().replace(/^\[(.*)\]$/, '$1')
  if (!a.includes(':')) return a
  try {
    return new URL(`http://[${a}]/`).hostname.slice(1, -1)
  } catch {
    return a.toLowerCase()
  }
}
