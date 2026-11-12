/**
 * `agenthix demo reset [--yes]` (adr-0186): the demo's data removed and hq and its site started afresh, now rather
 * than at the next scheduled reset. Refused, before anything is asked, on an installation that is not a demo.
 */
import type { DemoResetCheck, DemoResetResult } from '../demo/reset'
import type { Ask } from './backups'
import { wrap } from './words'

export type DemoCommand = { kind: 'demoReset'; yes: boolean }

export function parseDemo(args: string[]): DemoCommand | { kind: 'usage'; message: string } {
  const [verb, ...rest] = args
  if (verb !== 'reset') return { kind: 'usage', message: 'demo takes reset: demo reset [--yes]' }
  if (rest.some(a => a !== '--yes')) return { kind: 'usage', message: 'demo reset takes --yes, nothing else.' }
  return { kind: 'demoReset', yes: rest.includes('--yes') }
}

export type DemoIo = { out: (text: string) => void; confirm: (question: string, yes: boolean) => Promise<boolean> }

const clock = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`

export async function demoCommand(command: DemoCommand, call: Ask, io: DemoIo): Promise<number> {
  const check = await call<DemoResetCheck>({ op: 'demo.reset' })
  io.out(wrap(`This removes everything visitors did in the demo at ${check.address} — its databases and its files — and ` +
    `starts it again with the sample organisation as it was. Nothing is backed up. Without this, the next reset is at ${clock(check.nextResetAt)}.`))
  if (!(await io.confirm('Reset the demo now?', command.yes))) return 1
  const r = await call<DemoResetResult>({ op: 'demo.reset', confirmed: true })
  io.out(wrap(`The demo was reset. The next reset is at ${clock(r.nextResetAt)}.`))
  return 0
}
