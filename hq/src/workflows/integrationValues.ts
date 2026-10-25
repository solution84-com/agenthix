/**
 * Values an integration mints for one run (workflows spec part 3, S5): `GITHUB_TOKEN`, minted through the mint gate
 * (part 4) when a step names it, with the version's declared permissions for the run's workspace's repository, kept
 * encrypted in `WorkflowMintedToken` until it expires, revoked when the run ends, fails or is stopped, and masked in
 * every later run of the place while it still works.
 */
import { randomUUID } from 'node:crypto'
import { HttpError, prisma } from 'wasp/server'
import { INTEGRATION_SECRET_NAMES, type WorkflowDefinition, type WorkflowRunGitHub } from '@agenthix/core'
import { decryptBytesBound, encryptBytesBound } from '../server/crypto/secretCrypto'
import { mintForLocation, revokeGateToken, type GateToken, type LocationMint } from '../github/mintGate'
import type { WorkflowPlace } from './placeAccess'

export type MintedValue = { name: string; value: Buffer; expiresAt: Date }

export type MintRequest = { runId: string; place: WorkflowPlace; definition: WorkflowDefinition }

export type Minted = { values: MintedValue[]; github: WorkflowRunGitHub | null }

const isIntegrationName = (n: string) => (INTEGRATION_SECRET_NAMES as readonly string[]).includes(n)

/** The integration names a definition's steps use. */
export function integrationNamesOf(definition: WorkflowDefinition): string[] {
  return [...new Set(definition.steps.flatMap((s) => s.secrets).filter(isIntegrationName))].sort()
}

export type IntegrationDeps = {
  mintGitHub(req: LocationMint): Promise<GateToken>
  revoke(token: string): Promise<boolean>
}
const defaultDeps: IntegrationDeps = { mintGitHub: mintForLocation, revoke: revokeGateToken }

// GitHub's answer names the repository; anything else is not used as an address.
const FULL_NAME = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+$/

/**
 * Mints what the run's steps name. Throws an HttpError, before anything is stored, when it can't. The workspace, its
 * place, its site and the person come from the run's own row, never from the caller.
 */
export async function mintIntegrationValues(run: MintRequest, deps: IntegrationDeps = defaultDeps): Promise<Minted> {
  if (!integrationNamesOf(run.definition).includes('GITHUB_TOKEN')) return { values: [], github: null }
  const row = await prisma.workflowRun.findUnique({
    where: { id: run.runId },
    select: { placeType: true, placeId: true, workspaceId: true, siteId: true, onBehalfOfUserId: true },
  })
  if (!row || row.placeType !== run.place.type || row.placeId !== run.place.id) {
    throw new HttpError(409, 'This run isn\'t recorded in its place, so no GitHub token is minted for it. Nothing was changed.')
  }
  const gate = await deps.mintGitHub({
    place: run.place, siteId: row.siteId, workspaceId: row.workspaceId, person: row.onBehalfOfUserId, needs: 'work',
    permissions: run.definition.github,
  })
  const value = Buffer.from(gate.token, 'utf8')
  try {
    if (!FULL_NAME.test(gate.repository.fullName)) throw new Error('GitHub answered a repository name HQ does not use as an address')
    const id = randomUUID()
    await prisma.workflowMintedToken.create({
      data: {
        id, runId: run.runId, placeType: run.place.type, placeId: run.place.id, name: 'GITHUB_TOKEN',
        ciphertext: encryptBytesBound(value, mintedTokenAssociatedData(id, run.place)), expiresAt: gate.expiresAt,
      },
    })
  } catch (err) {
    value.fill(0)
    await deps.revoke(gate.token).catch(() => false)
    throw err
  }
  return {
    values: [{ name: 'GITHUB_TOKEN', value, expiresAt: gate.expiresAt }],
    github: {
      repository: gate.repository.fullName,
      repositoryId: gate.repository.id,
      cloneUrl: `https://github.com/${gate.repository.fullName}.git`,
    },
  }
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

/** Revokes one minted value where it was issued; true once the issuer has it revoked. */
export async function revokeAtIssuer(name: string, value: Buffer, deps: Pick<IntegrationDeps, 'revoke'> = defaultDeps): Promise<boolean> {
  if (name !== 'GITHUB_TOKEN') return false
  return deps.revoke(value.toString('utf8'))
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
