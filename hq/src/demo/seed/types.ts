import type { Prisma } from '@prisma/client'
import type { DemoSeed, SeedIds } from '@agenthix/core'
import type { PackageFile } from '../../library/packages/packageZip'

export type SeedDb = Prisma.TransactionClient

/** What the seed needs from hq beyond Prisma, given so a test can run it without a database or keys. */
export type SeedDeps = {
  now: Date
  /** hq's own password hash (Wasp's). */
  hashPassword(plain: string): Promise<string>
  /** A password nobody knows: visitors never sign in as a seeded person. */
  newPassword(): string
  /** hq's at-rest sealing (`SECRETS_MASTER_KEY`), for conversations' messages and provider keys. */
  seal(plain: string): string
  /** A place secret's ciphertext, bound to its id and place, as the secret store writes it. */
  sealSecret(secretId: string, projectId: string, plain: string): Buffer
  /** An agent's instructions held as its package, by digest. */
  writeAgentInstructions(db: SeedDb, agentId: string, text: string): Promise<void>
  /** An organisation skill's one published version, with its files: what the Library holds, as *Add to this place* copies it. */
  publishSkill(db: SeedDb, skill: { name: string; files: PackageFile[]; givenToAll: boolean; grantedTo: string[]; byId: string; at: Date }, agentIds: Record<string, string>): Promise<PublishedSkill>
  /** Files kept by their fingerprint, as a version's content is (`assets/content.ts`); returns the fingerprint. */
  storeFiles(db: SeedDb, files: PackageFile[]): Promise<string>
  /** The executor image every seeded workflow version is hashed with: the demo has none, so a fixed stand-in. */
  executorImageDigest: string
}

/** A Library skill as published: its identity (`publisher/name`), its version and that version's files. */
export type PublishedSkill = { identity: string; version: string; files: PackageFile[] }

export type SeedContext = {
  db: SeedDb
  seed: DemoSeed
  ids: SeedIds
  deps: SeedDeps
  /** hq's default site, which holds every place's storage: its row id, and its own logical id. */
  siteId: string
  siteLogicalId: string
  /** The built-in agent, which the seed never makes: hq did at start. */
  kernelId: string
  /** Minutes from now to a date. */
  at(minutes: number): Date
}

/** The fake key every seeded provider holds. Not a credential for anything. */
export const DEMO_PROVIDER_KEY = 'sk-demo-not-a-key'
/** Far ahead, so hq's hourly provider check never falls due and no vendor is ever reached. */
export const NEVER_CHECKED = new Date('2100-01-01T00:00:00Z')
