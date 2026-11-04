/**
 * Cloud's operations that hq answers (pre-release spec B6, B7, C1; adr-0115, adr-0133, adr-0135): its sites joining
 * and leaving hq, the three account links, and connecting hq to the organisation Cloud runs it for. On the machine that runs hq they go to hq over its control socket (`hq/control.ts`),
 * the machine's one way into hq; on any other machine there is no hq to ask. They reach here only from an envelope
 * Cloud's pinned identity sealed, on a machine enrolled with Cloud (`dispatch.ts`).
 *
 * A link hq answers is passed on sealed to Cloud and nowhere else: never logged, never kept.
 */
import { parseHqCloudRequest, parseOrganisationKeyResult, type CloudOnlyResults, type HqCloudOperation, type HqCloudRequest } from '@agenthix/core'
import { organisationKeyResultMatches } from '@agenthix/core/cloud-crypto'
import { installed, type Context } from '../service/context'
import { Refusal } from '../owner/results'
import type { HqCommandResult } from '../hq/control'
import type { CloudOnlyHandler, CloudOnlyHandlers } from './handlers'

/** The request's fields by core's rule for them, the same hq checks them by. */
function fields<O extends HqCloudOperation>(op: O, request: Record<string, unknown>): HqCloudRequest<O> {
  const parsed = parseHqCloudRequest(op, request)
  if (!parsed.ok) throw new Refusal('malformed', `The request's ${parsed.field} is missing or not valid.`)
  return parsed.request
}

const REFUSAL_OF: Record<NonNullable<Extract<HqCommandResult, { ok: false }>['code']>, Refusal['code']> = {
  not_found: 'not_found', conflict: 'conflict', usage: 'malformed', unknown: 'unknown_operation',
}

async function askHq(ctx: Context, command: string, args: string[]): Promise<Record<string, unknown>> {
  if (!installed(ctx).hq) throw new Refusal('not_installed', `No HQ here: ${ctx.machine.name} runs no HQ.`)
  const answer = await ctx.hqControl.run(command, args)
  if (!answer) throw new Refusal('busy', 'HQ is not answering yet. Try again once it is running.')
  if (!answer.ok) throw new Refusal(answer.code ? REFUSAL_OF[answer.code] : 'failed', answer.error)
  if (!answer.data) throw new Refusal('failed', 'HQ answered without a result.')
  return answer.data
}

const notAnswer = (): Refusal => new Refusal('failed', 'HQ answered with something the host service does not read.')

function link(data: Record<string, unknown>): { link: string; expiresAt: string } {
  const { link, expiresAt } = data
  if (typeof link !== 'string' || !link.startsWith('https://') || typeof expiresAt !== 'string' || Number.isNaN(Date.parse(expiresAt))) throw notAnswer()
  return { link, expiresAt }
}

function firstLinkAnswer(data: Record<string, unknown>): CloudOnlyResults['account.firstLink'] {
  if (data.state !== 'hasAccounts') return link(data)
  const first = data.firstAdmin as { madeAt?: unknown; madeWith?: { kind?: unknown; ref?: unknown } } | undefined
  const madeWith = first?.madeWith
  if (typeof data.accounts !== 'number' || typeof first?.madeAt !== 'string' || !madeWith) throw notAnswer()
  if (madeWith.kind === 'firstLink' && typeof madeWith.ref === 'string') {
    return { state: 'hasAccounts', accounts: data.accounts, firstAdmin: { madeAt: first.madeAt, madeWith: { kind: 'firstLink', ref: madeWith.ref } } }
  }
  if (madeWith.kind === 'other') return { state: 'hasAccounts', accounts: data.accounts, firstAdmin: { madeAt: first.madeAt, madeWith: { kind: 'other' } } }
  throw notAnswer()
}

const siteRegister: CloudOnlyHandler<'site.register'> = {
  parse: r => fields('site.register', r),
  run: async (ctx, r) => {
    const data = await askHq(ctx, 'cloud-site-register', [r.machineId, r.siteName, r.credentialHash])
    if (typeof data.executionSiteId !== 'string') throw notAnswer()
    return { executionSiteId: data.executionSiteId }
  },
}

const siteUnregister: CloudOnlyHandler<'site.unregister'> = {
  parse: r => fields('site.unregister', r),
  run: async (ctx, r) => {
    const data = await askHq(ctx, 'cloud-site-unregister', [r.executionSiteId])
    if (typeof data.removed !== 'boolean') throw notAnswer()
    return { removed: data.removed }
  },
}

const firstLink: CloudOnlyHandler<'account.firstLink'> = {
  parse: r => fields('account.firstLink', r),
  run: async (ctx, r) => firstLinkAnswer(await askHq(ctx, 'cloud-first-link', [r.ref])),
}

const resetLink: CloudOnlyHandler<'account.resetLink'> = {
  parse: r => fields('account.resetLink', r),
  run: async (ctx, r) => link(await askHq(ctx, 'cloud-reset-link', [r.username])),
}

const adminInvite: CloudOnlyHandler<'account.adminInvite'> = {
  parse: r => fields('account.adminInvite', r),
  run: async ctx => link(await askHq(ctx, 'cloud-admin-invite', [])),
}

const organisationKey: CloudOnlyHandler<'organisation.key'> = {
  parse: r => fields('organisation.key', r),
  run: async ctx => {
    // The key and the address Cloud registers together: the address is where its sign-ins go back to.
    const key = parseOrganisationKeyResult(await askHq(ctx, 'cloud-organisation-key', []))
    // A client id that is not the key's thumbprint could never be matched by its assertions: caught before Cloud registers it.
    if (!key || !(await organisationKeyResultMatches(key))) throw notAnswer()
    return key
  },
}

const organisationConnect: CloudOnlyHandler<'organisation.connect'> = {
  parse: r => fields('organisation.connect', r),
  run: async (ctx, r) => {
    const { cloudOrganisationId, name, connectedAt } = await askHq(ctx, 'cloud-organisation-connect', [r.cloudOrganisationId, r.name])
    if (typeof cloudOrganisationId !== 'string' || typeof name !== 'string' || typeof connectedAt !== 'string') throw notAnswer()
    return { cloudOrganisationId, name, connectedAt }
  },
}

export const HQ_CLOUD_HANDLERS = {
  'site.register': siteRegister,
  'site.unregister': siteUnregister,
  'account.firstLink': firstLink,
  'account.resetLink': resetLink,
  'account.adminInvite': adminInvite,
  'organisation.key': organisationKey,
  'organisation.connect': organisationConnect,
} satisfies CloudOnlyHandlers
