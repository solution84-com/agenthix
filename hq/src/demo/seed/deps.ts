import { createHash, randomBytes } from 'node:crypto'
import { hashPassword } from 'wasp/auth/password'
import { writePackage } from '../../packages/packageStore'
import { storeContent } from '../../assets/content'
import { organisationPublisher } from '../../assets/organisationPublisher'
import { formatAssetIdentity } from '@agenthix/core'
import { withSkillMetadata } from '../../assets/places/metadata'
import { encryptBytesBound, encryptSecret } from '../../server/crypto/secretCrypto'
import { secretAssociatedData } from '../../secrets/place'
import { FIRST_VERSION } from './placeSkills'
import type { PublishedSkill, SeedDb, SeedDeps } from './types'

async function publishSkill(db: SeedDb, skill: Parameters<SeedDeps['publishSkill']>[1], agentIds: Record<string, string>): Promise<PublishedSkill> {
  const publisher = await organisationPublisher(db)
  const asset = await db.asset.create({ data: { kind: 'SKILL', publisher, name: skill.name, givenToAll: skill.givenToAll, createdAt: skill.at } })
  const files = withSkillMetadata(skill.files, { version: FIRST_VERSION })
  const digest = await storeContent(files, db)
  const version = await db.assetVersion.create({
    data: { assetId: asset.id, version: FIRST_VERSION, digest, source: 'MADE_HERE', note: 'First version', byId: skill.byId, createdAt: skill.at },
  })
  await db.asset.update({ where: { id: asset.id }, data: { currentVersionId: version.id } })
  await db.assetPinChange.create({ data: { assetId: asset.id, fromVersionId: null, toVersionId: version.id, byId: skill.byId, reason: 'Published: First version', at: skill.at } })
  for (const handle of skill.grantedTo) {
    const agentId = agentIds[handle]
    if (!agentId) throw new Error(`The demo seed gives a skill to an agent ${handle} that it does not hold.`)
    await db.assetGrant.create({ data: { assetId: asset.id, agentId, grantedById: skill.byId, createdAt: skill.at } })
  }
  return { identity: formatAssetIdentity(asset), version: FIRST_VERSION, files }
}

/** hq's own pieces, for the seed that runs at start in demo mode (`run.ts`). */
export function hqSeedDeps(now: Date): SeedDeps {
  return {
    now,
    hashPassword,
    // Thirty-two random bytes, used once to make a hash and then dropped: no one can sign in as a seeded person.
    newPassword: () => randomBytes(32).toString('base64url'),
    seal: encryptSecret,
    sealSecret: (secretId, projectId, plain) => encryptBytesBound(Buffer.from(plain, 'utf-8'), secretAssociatedData(secretId, { type: 'project', id: projectId })),
    async writeAgentInstructions(db, agentId, text) {
      await writePackage({ kind: 'agent', key: agentId, files: [{ path: 'instructions.md', content: Buffer.from(text, 'utf-8') }], updatedById: null }, db)
    },
    publishSkill,
    storeFiles: (db, files) => storeContent(files, db),
    // The demo has no executor image; a version is hashed with this fixed stand-in so the rows are well formed.
    executorImageDigest: `sha256:${createHash('sha256').update('demo-has-no-executor-image').digest('hex')}`,
  }
}
