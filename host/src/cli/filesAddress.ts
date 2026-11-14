/**
 * `agenthix hq files-address <host>` (install/filesAddress.ts): uploaded files served from a host of the person's
 * choosing, and what to do next so it answers.
 */
import type { Ask } from './backups'
import type { FilesAddressResult } from '../install/filesAddress'
import { hostNameProblem } from '../frontDoor/config'
import { cmd, nextStep, wrap } from './words'

export type FilesAddressCommand = { kind: 'hqFilesAddress'; host: string }

type Usage = { kind: 'usage'; message: string }

export function parseFilesAddress(args: string[]): FilesAddressCommand | Usage {
  if (args.length !== 1) return { kind: 'usage', message: "Give the host uploaded files are served from: hq files-address <host>" }
  const host = args[0].toLowerCase()
  const problem = hostNameProblem(host)
  return problem ? { kind: 'usage', message: `Files cannot be served from ${host}: ${problem}.` } : { kind: 'hqFilesAddress', host }
}

export function filesAddressDone(r: FilesAddressResult): string {
  const host = new URL(r.filesOrigin).hostname
  if (r.frontDoor) return wrap(`Uploaded files are served at ${r.filesOrigin} now. The front door holds its certificate and renews it on its own.`)
  const at = r.listen.port === null ? r.listen.bind : `${r.listen.bind}:${r.listen.port}`
  return [
    wrap(`Uploaded files are served at ${r.filesOrigin} now. Point ${host} at this machine in DNS, and serve it as HQ's ` +
      `own address is served: a web server of this machine's own passes it to HQ on ${at}, with a certificate for it.`),
    nextStep(`When another installation's front door serves this one, run this on that installation, so it serves ${host} too:`,
      cmd(`front-door add-installation ${r.namespace}`)),
  ].join('\n')
}

export async function filesAddressCommand(command: FilesAddressCommand, call: Ask, out: (text: string) => void): Promise<number> {
  const r = await call<FilesAddressResult>({ op: 'hq.filesAddress', host: command.host })
  out(filesAddressDone(r))
  return 0
}
