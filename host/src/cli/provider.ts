/**
 * `provider add|list|remove` (models from one place, part 1): the machine admin's way to the organisation's
 * providers, on HQ's machine, for a machine stood up at a terminal with no browser. Each goes to hq's provider store
 * with the actor *machine*, the same check with the vendor, record and announcement to every organisation admin as
 * the Providers page's. The key is read from standard input, unseen in a terminal, and never from the command line;
 * it travels to hq inside the request, never as any process's argument.
 */
import { AI_PROVIDER_VENDORS, AI_PROVIDER_VENDOR_INFO, type AiProviderVendor } from '@agenthix/core'
import type { HelpRow } from './commands'
import { cmd, wrap } from './words'

type KeyedVendor = Exclude<AiProviderVendor, 'cloud'>

export type ProviderCommand =
  | { kind: 'providerAdd'; vendor: KeyedVendor; name?: string; address?: string }
  | { kind: 'providerList' }
  | { kind: 'providerRemove'; which: string; yes: boolean }

type Usage = { kind: 'usage'; message: string }

const VENDORS = AI_PROVIDER_VENDORS.filter((v): v is KeyedVendor => v !== 'cloud')
const isKeyedVendor = (v: string | undefined): v is KeyedVendor => (VENDORS as readonly string[]).includes(v ?? '')
const VENDOR_LIST = VENDORS.join(', ')

function takeOption(args: string[], name: string): { value?: string; rest: string[]; bad: boolean } {
  const i = args.indexOf(name)
  if (i < 0) return { rest: args, bad: false }
  const value = args[i + 1]
  if (value === undefined || value.startsWith('--')) return { rest: args, bad: true }
  return { value, rest: [...args.slice(0, i), ...args.slice(i + 2)], bad: false }
}

/** `provider <verb>`. A key given on the command line is refused: it would stay in the shell's history. */
export function parseProvider(verb: string | undefined, args: string[]): ProviderCommand | Usage {
  if (verb === 'list') return args.length ? { kind: 'usage', message: 'provider list takes nothing more.' } : { kind: 'providerList' }
  if (verb === 'remove') {
    const yes = args.includes('--yes')
    const names = args.filter(a => a !== '--yes')
    return names.length === 1 && !names[0].startsWith('--')
      ? { kind: 'providerRemove', which: names[0], yes }
      : { kind: 'usage', message: 'Name the provider by its vendor: provider remove <vendor>' }
  }
  if (verb === 'add') {
    const name = takeOption(args, '--name')
    const address = takeOption(name.rest, '--address')
    const [vendor, ...extra] = address.rest
    if (name.bad || address.bad) return { kind: 'usage', message: '--name and --address each take a value.' }
    if (!isKeyedVendor(vendor)) return { kind: 'usage', message: `provider add takes one of: ${VENDOR_LIST}.` }
    if (extra.length) {
      return { kind: 'usage', message: 'provider add takes the vendor, --name and --address, nothing else. The key is asked for, never typed on the command line.' }
    }
    if (address.value && !AI_PROVIDER_VENDOR_INFO[vendor].hasAddress) return { kind: 'usage', message: `${AI_PROVIDER_VENDOR_INFO[vendor].label} takes no --address.` }
    if (!address.value && AI_PROVIDER_VENDOR_INFO[vendor].hasAddress) return { kind: 'usage', message: 'Your own endpoint needs its --address.' }
    return { kind: 'providerAdd', vendor, ...(name.value ? { name: name.value } : {}), ...(address.value ? { address: address.value } : {}) }
  }
  return { kind: 'usage', message: `There is no command "provider${verb ? ` ${verb}` : ''}${args.length ? ` ${args.join(' ')}` : ''}".` }
}

export const PROVIDER_HELP: HelpRow[] = [
  { group: 'hq', usage: 'provider add <vendor> [--name <name>] [--address <address>]', does: "Add one of the organisation's model or voice providers",
    detail: `On HQ's machine, as an organisation admin does on Providers in HQ: ${VENDOR_LIST}. It asks for the key, which is not shown as it is typed; from a script, pipe it in. The key is checked with the vendor before HQ stores it, and only its last four characters are ever shown again. The organisation has at most one of each vendor. Your own OpenAI-compatible endpoint (openai_compatible) needs --address, and its key may be left empty. Every organisation admin is told, and the change is recorded.` },
  { group: 'hq', usage: 'provider list', does: "The organisation's providers, and whether each works",
    detail: "Every provider: its name, what it provides (LLM, STT, TTS), whether it works, and the last four characters of its key. A custom endpoint's address is shown." },
  { group: 'hq', usage: 'provider remove <vendor> [--yes]', does: 'Remove one of the providers',
    detail: "Whatever used it falls to another provider of its type, and the answer says what. Refused when it would leave no model, speech-to-text or text-to-speech provider. Every organisation admin is told. It asks first; --yes answers for a script. A key that may have leaked is revoked by an organisation admin on Providers in HQ, which is never refused." },
]

export type ProviderAnswer = { text: string; data?: Record<string, unknown> }

export type ProviderIo = {
  out: (text: string) => void
  err: (text: string) => void
  write: (text: string) => void
  /** A line typed unseen; null when there is no one to ask and nothing piped in. */
  secret: (prompt: string) => Promise<string | null>
  confirm: (question: string, yes: boolean) => Promise<boolean>
}

type Call = (request: unknown) => Promise<ProviderAnswer>

export async function providerCommand(command: ProviderCommand, call: Call, io: ProviderIo): Promise<number> {
  if (command.kind === 'providerList') {
    io.out((await call({ op: 'hq.provider', action: 'list' })).text)
    return 0
  }
  if (command.kind === 'providerRemove') {
    if (!(await io.confirm(`Remove ${command.which}? Whatever uses it falls to another provider of its type.`, command.yes))) return 1
    io.out(wrap((await call({ op: 'hq.provider', action: 'remove', which: command.which })).text))
    return 0
  }
  const info = AI_PROVIDER_VENDOR_INFO[command.vendor]
  const typed = await io.secret(info.hasAddress ? 'API key, or Enter for none (not shown): ' : 'API key (not shown): ')
  if (typed === null) {
    io.err(wrap(`Nothing to read the key from: run it in a terminal, or pipe the key in. Never put it on the command line: ${cmd('provider add')} asks for it.`))
    return 1
  }
  const key = typed.trim()
  if (!key && !info.hasAddress) {
    io.err(wrap(`${info.label} needs its key. Nothing was added.`))
    return 1
  }
  io.write(`Checking with ${info.label}… `)
  const answer = await call({ op: 'hq.provider', action: 'add', vendor: command.vendor, key, name: command.name, address: command.address })
  io.out('works.')
  io.out(wrap(answer.text))
  return 0
}
