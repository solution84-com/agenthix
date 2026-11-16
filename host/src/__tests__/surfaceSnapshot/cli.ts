/**
 * The `agenthix` commands and options, from the help rows a machine's own build lists (Agenthix Cloud's are behind
 * its preview flag, off in the published image, so they are not yet part of what an installation relies on). Each
 * entry is a command, `<command> <word>` for a word it takes (`backup export`), or `<command> --<option>`.
 */
import { HELP, type HelpRow } from '../../cli/commands'
import { PROVIDER_HELP } from '../../cli/provider'

const WORD = /^[a-z][a-z-]*$/
const OPTION = /--[a-z](?:[a-z0-9-]*[a-z0-9])?/g

/** `hq suspend | resume [--on <date>]` is the commands `hq suspend` and `hq resume`, and its option `--on`. */
export function rowEntries(row: HelpRow): string[] {
  let usage = row.usage.replace(/<[^>]*>/g, ' ')
  const words: string[] = []
  const options = new Set([...row.detail.matchAll(OPTION)].map(m => m[0]))
  for (const [group, inside] of usage.matchAll(/\[([^\]]*)\]/g)) {
    usage = usage.replace(group, ' ')
    // In a group with an option, the words are its values; otherwise they are words the command takes.
    if (inside.includes('--')) for (const m of inside.matchAll(OPTION)) options.add(m[0])
    else words.push(...inside.split(/[\s|]+/).filter(w => WORD.test(w)))
  }
  for (const m of usage.matchAll(OPTION)) options.add(m[0])
  const [first, ...alternatives] = usage.replace(OPTION, ' ').split('|').map(part => part.trim().split(/\s+/).filter(w => WORD.test(w)))
  const commands = [first.join(' '), ...alternatives.map(alt => [...first.slice(0, -1), ...alt].join(' '))]
  return commands.flatMap(command => [command, ...words.map(w => `${command} ${w}`), ...[...options].map(o => `${command} ${o}`)])
}

export function cliEntries(): string[] {
  return [...new Set([...HELP, ...PROVIDER_HELP].flatMap(rowEntries))].sort()
}
