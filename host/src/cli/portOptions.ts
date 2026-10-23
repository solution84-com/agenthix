/** The flags that choose an installation's published ports, on the commands that install HQ or its Fleet Console. */
import { PUBLISHED_DEFAULTS } from '@agenthix/core'
import type { PortChoice } from '../install/ports'

/** `--hq-port <port>` and `--console-port <port>`, each a whole number; the host service checks the bounds. */
export function portOptions(args: string[], names: readonly ('--hq-port' | '--console-port')[]): { ports: PortChoice; rest: string[] } | { problem: string } {
  const ports: PortChoice = {}
  let rest = args
  for (const name of names) {
    const i = rest.indexOf(name)
    if (i < 0) continue
    const value = rest[i + 1]
    const example = name === '--hq-port' ? PUBLISHED_DEFAULTS.hq : PUBLISHED_DEFAULTS.console
    if (value === undefined || !/^\d{1,5}$/.test(value)) return { problem: `${name} takes a port, a whole number such as ${example}.` }
    rest = [...rest.slice(0, i), ...rest.slice(i + 2)]
    ports[name === '--hq-port' ? 'hqPort' : 'consolePort'] = Number(value)
  }
  return { ports, rest }
}
