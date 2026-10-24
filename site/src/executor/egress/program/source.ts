/**
 * The proxy's program as the text its container's `node` reads on standard input: the program's functions' own
 * source, then a call with this run's settings. Built from the functions themselves rather than kept as a second
 * copy, so what runs in the container is what the tests run here, under tsx, under vitest and in the bundle alike.
 * The settings are the approved hosts and the proxy's address: nothing secret.
 */
import { makeNonPublicCheck, normaliseAddress } from './addressPolicy'
import { answerDnsQuery } from './dnsAnswer'
import { runEgressProxy, type EgressProxyConfig } from './proxyMain'
import { httpHost, requestedName, tlsServerName } from './requestedName'

const PARTS: Array<(...args: never[]) => unknown> = [
  answerDnsQuery, tlsServerName, httpHost, requestedName, makeNonPublicCheck, normaliseAddress, runEgressProxy,
]

/** A function's name as its source declares it, which a bundler may have renamed consistently with its callers. */
function declaredName(fn: (...args: never[]) => unknown): string {
  const m = /^(?:async\s+)?function\s*\*?\s*([\w$]+)/.exec(fn.toString())
  if (!m) throw new Error('The egress proxy\'s program is built from function declarations only.')
  return m[1]!
}

export function egressProxyProgram(config: EgressProxyConfig): string {
  // Keyed by the names `runEgressProxy` reads from `lib`, which a bundler keeps even where it renames a function.
  const helpers = Object.entries({ answerDnsQuery, makeNonPublicCheck, normaliseAddress, requestedName })
    .map(([key, fn]) => `${key}: ${declaredName(fn)}`).join(', ')
  return [
    "import dgram from 'node:dgram'",
    "import dns from 'node:dns'",
    "import net from 'node:net'",
    // A transpiler that keeps function names may call this helper inside a function body.
    'function __name(target) { return target }',
    ...PARTS.map(fn => fn.toString()),
    `${declaredName(runEgressProxy)}(${JSON.stringify(config)}, { dgram, dns, net, ${helpers} }).catch(() => process.exit(1))`,
  ].join('\n')
}
