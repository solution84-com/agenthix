/**
 * Agenthix Cloud's operations that the host service on hq's machine passes to hq (pre-release spec B6, B7, C1), over the
 * same control socket as the machine admin's own commands (controlSocket.ts). The host service sends them only for a
 * request that came sealed from Cloud's pinned identity, on a machine enrolled with Cloud (host's cloud/hqOperations.ts).
 * Whoever can open the socket already controls hq's machine, so these add nothing to what that person can do.
 *
 * Each takes the operation's fields as arguments, in the order core lists them, checked by core's rule for them
 * (`parseHqCloudRequest`), the same the host service checks. Each answers core's result for the operation as `data`,
 * and a refusal with its `code`. The text never holds a link: nothing prints these, and a link must never reach a log.
 */
import { HQ_CLOUD_FIELDS, parseHqCloudRequest, type HqCloudOperation } from '@agenthix/core'
import type { CommandResult } from './hqMachineCommands'
import { CloudLinkRefusal, cloudAdminInvite, cloudFirstLink, cloudResetLink } from './cloudAccountLinks'
import { CloudSiteRefusal, registerCloudSite, unregisterCloudSite } from '../../fleet/cloudSites'
import { cloudConnectionKey, connectByCloud } from '../../cloud'
import { CloudConnectionError } from '../../cloud/cloudConnection'
import { CloudCallError } from '../../cloud/cloudClient'

export const CLOUD_MACHINE_COMMANDS = [
  'cloud-site-register', 'cloud-site-unregister', 'cloud-first-link', 'cloud-reset-link', 'cloud-admin-invite',
  'cloud-organisation-key', 'cloud-organisation-connect',
] as const

export type CloudMachineCommand = (typeof CLOUD_MACHINE_COMMANDS)[number]

export const isCloudMachineCommand = (command: string): command is CloudMachineCommand =>
  (CLOUD_MACHINE_COMMANDS as readonly string[]).includes(command)

const done = (data: Record<string, unknown>): CommandResult => ({ ok: true, text: 'Done.', data })

/** Each command's operation, and its arguments in the order core lists the operation's fields. */
const OPERATION_OF = {
  'cloud-site-register': 'site.register',
  'cloud-site-unregister': 'site.unregister',
  'cloud-first-link': 'account.firstLink',
  'cloud-reset-link': 'account.resetLink',
  'cloud-admin-invite': 'account.adminInvite',
  'cloud-organisation-key': 'organisation.key',
  'cloud-organisation-connect': 'organisation.connect',
} as const satisfies Record<CloudMachineCommand, HqCloudOperation>

function usage(command: CloudMachineCommand): CommandResult {
  const fields = Object.keys(HQ_CLOUD_FIELDS[OPERATION_OF[command]]).map(f => ` <${f}>`).join('')
  return { ok: false, error: `Usage: ${command}${fields}`, code: 'usage' }
}

async function run(command: CloudMachineCommand, args: string[]): Promise<CommandResult> {
  const op = OPERATION_OF[command]
  const fields = Object.fromEntries(Object.keys(HQ_CLOUD_FIELDS[op]).map((name, i) => [name, args[i]]))
  const parsed = parseHqCloudRequest(op, fields)
  if (!parsed.ok) return usage(command)
  const r = parsed.request
  switch (r.op) {
    case 'site.register': return done(await registerCloudSite({ machineId: r.machineId, siteName: r.siteName, credentialHash: r.credentialHash }))
    case 'site.unregister': return done(await unregisterCloudSite(r.executionSiteId))
    case 'account.firstLink': return done(await cloudFirstLink(r.ref))
    case 'account.resetLink': return done(await cloudResetLink(r.username))
    case 'account.adminInvite': return done(await cloudAdminInvite())
    case 'organisation.key': return done(await cloudConnectionKey())
    case 'organisation.connect': return done(await connectByCloud({ cloudOrganisationId: r.cloudOrganisationId, name: r.name }))
  }
}

export async function runCloudMachineCommand(command: CloudMachineCommand, args: string[]): Promise<CommandResult> {
  try {
    return await run(command, args)
  } catch (err) {
    if (err instanceof CloudLinkRefusal || err instanceof CloudSiteRefusal) return { ok: false, error: err.message, code: err.code }
    if (err instanceof CloudConnectionError) return { ok: false, error: err.message, code: 'conflict' }
    if (err instanceof CloudCallError) return { ok: false, error: err.message }
    throw err
  }
}
