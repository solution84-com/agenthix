/**
 * Values an integration mints for one run (workflows spec part 3, S5): `GITHUB_TOKEN`, minted through the mint gate
 * (part 4) when a step names it, kept encrypted in `WorkflowMintedToken` until it expires, revoked when the run ends,
 * and masked in every later run of the place while it still works.
 *
 * GitHub tokens for workflows come with lane 4a, which replaces `mintIntegrationValues`' body and
 * `revokeAtIssuer`. Until then a run whose steps name `GITHUB_TOKEN` is refused before anything is sent, and there is
 * nothing to revoke.
 */
import { HttpError, prisma } from 'wasp/server'
import { INTEGRATION_SECRET_NAMES, type WorkflowDefinition, type WorkflowRunGitHub } from '@agenthix/core'
import { decryptBytesBound } from '../server/crypto/secretCrypto'
import type { WorkflowPlace } from './placeAccess'

export type MintedValue = { name: string; value: Buffer; expiresAt: Date }

export type MintRequest = { runId: string; place: WorkflowPlace; definition: WorkflowDefinition }

export type Minted = { values: MintedValue[]; github: WorkflowRunGitHub | null }

export const GITHUB_TOKENS_NOT_YET = 'GitHub tokens for workflows arrive with an update. Nothing was changed.'

const isIntegrationName = (n: string) => (INTEGRATION_SECRET_NAMES as readonly string[]).includes(n)

/** The integration names a definition's steps use. */
export function integrationNamesOf(definition: WorkflowDefinition): string[] {
  return [...new Set(definition.steps.flatMap((s) => s.secrets).filter(isIntegrationName))].sort()
}

/** Mints what the run's steps name. Throws an HttpError, before anything is stored, when it can't. */
export async function mintIntegrationValues(run: MintRequest): Promise<Minted> {
  if (integrationNamesOf(run.definition).includes('GITHUB_TOKEN')) throw new HttpError(409, GITHUB_TOKENS_NOT_YET)
  return { values: [], github: null }
}

/** What a minted token's value is bound to when it is encrypted: its row, and its place. */
export function mintedTokenAssociatedData(tokenId: string, place: WorkflowPlace): string {
  return `workflow-minted-token\u0000${tokenId}\u0000${place.type}\u0000${place.id}`
}

/**
 * Every minted value of the place that hasn't expired, revoked or not, for masking only: a value one run left behind
 * is still masked when a later run prints it. One that no longer decrypts is skipped; it can't be printed either way.
 */
export async function unexpiredMintedValues(place: WorkflowPlace, now: Date = new Date()): Promise<MintedValue[]> {
  const rows = await prisma.workflowMintedToken.findMany({
    where: { placeType: place.type, placeId: place.id, expiresAt: { gt: now } },
    select: { id: true, name: true, ciphertext: true, expiresAt: true },
  })
  const out: MintedValue[] = []
  for (const r of rows) {
    try {
      out.push({ name: r.name, value: decryptBytesBound(r.ciphertext, mintedTokenAssociatedData(r.id, place)), expiresAt: r.expiresAt })
    } catch {
      // Unreadable: skipped.
    }
  }
  return out
}

/** Revokes one minted value where it was issued; true once the issuer has it revoked. Lane 4a fills it in. */
export async function revokeAtIssuer(_name: string, _value: Buffer): Promise<boolean> {
  return false
}

/** Revokes the run's minted values that are still unrevoked, marking each one its issuer confirmed. */
export async function revokeMintedTokens(runId: string, place: WorkflowPlace, now: Date = new Date()): Promise<void> {
  const rows = await prisma.workflowMintedToken.findMany({
    where: { runId, revokedAt: null, expiresAt: { gt: now } },
    select: { id: true, name: true, ciphertext: true },
  })
  for (const r of rows) {
    let value: Buffer
    try {
      value = decryptBytesBound(r.ciphertext, mintedTokenAssociatedData(r.id, place))
    } catch {
      continue
    }
    try {
      if (await revokeAtIssuer(r.name, value)) {
        await prisma.workflowMintedToken.update({ where: { id: r.id }, data: { revokedAt: new Date() } })
      }
    } finally {
      value.fill(0)
    }
  }
}
