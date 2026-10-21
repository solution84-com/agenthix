/**
 * `agenthix uninstall [--yes]`: takes the install off this machine. It says what it refuses first — HQ or a site
 * still here — then lists exactly what goes and asks; an erased HQ or site still in the bin is purged only once its
 * address or name is typed, as an erase asks for it, which `--yes` never answers.
 */
import type { UninstallPlan } from '../lifecycle/uninstall'
import type { Uninstalled } from '../lifecycle/uninstallSteps'
import type { Ask } from './backups'
import { notPurged, purgePrompt, uninstalledText, uninstallWarning } from './uninstallWords'
import { product, wrap } from './words'

export type UninstallCommand = { kind: 'uninstall'; yes: boolean }

export function parseUninstall(args: string[]): UninstallCommand | { kind: 'usage'; message: string } {
  const yes = args.includes('--yes')
  return args.some(a => a !== '--yes') ? { kind: 'usage', message: 'uninstall takes --yes, nothing else.' } : { kind: 'uninstall', yes }
}

export type UninstallIo = {
  out: (text: string) => void
  err: (text: string) => void
  ask: (prompt: string) => Promise<string | null>
  confirm: (question: string, yes: boolean) => Promise<boolean>
}

const NO_ONE = 'Nothing to ask with: run it in a terminal, where you can type the answer.'

export async function uninstallCommand(command: UninstallCommand, call: Ask, io: UninstallIo): Promise<number> {
  const plan = await call<UninstallPlan>({ op: 'machine.uninstallCheck' })
  io.out(uninstallWarning(plan))
  const purge: string[] = []
  for (const entry of plan.binned) {
    const typed = await io.ask(purgePrompt(entry))
    if (typed === null) {
      io.err(wrap(NO_ONE))
      return 1
    }
    if (typed.trim() !== entry.name) {
      io.err(notPurged(entry))
      return 1
    }
    purge.push(entry.name)
  }
  // A purge typed in is the confirmation; otherwise it asks, as the other warnings do.
  if (!plan.binned.length && !(await io.confirm(`Uninstall ${product} from ${plan.machine}?`, command.yes))) return 1
  const r = await call<Uninstalled>({ op: 'machine.uninstall', confirmed: true, purge })
  io.out('')
  io.out(uninstalledText(r, plan.hostImage))
  return r.notRemoved.length ? 1 : 0
}
