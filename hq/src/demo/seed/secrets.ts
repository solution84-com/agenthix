import { createHash } from 'node:crypto'
import { idFor, seedIds, seedTime, type DemoSeed } from '@agenthix/core'
import type { SecretsDb } from '../../secrets/db'
import type { SeedDeps } from './types'

/** A UUID that is the same at every start, for a secret (the data gives none): from its place and name. */
function secretId(project: string, name: string): string {
  const h = createHash('sha1').update(`agenthix-demo:secret:${project}:${name}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

/**
 * The organisation's secrets, as a name with no value anyone holds (spec, Today §4): a visitor sees the name, what it is
 * for and who issues it, never a value (a place's secret is never shown). Written through the secret store's own
 * database side, the only code that touches a secret's row, so it runs after hq's transaction commits; a secret that
 * is already there is left alone. The ciphertext is a placeholder sealed as the store seals a value; nothing reads it.
 */
export async function seedSecrets(seed: DemoSeed, store: Pick<SecretsDb, 'createSecret'>, deps: Pick<SeedDeps, 'now' | 'sealSecret'>): Promise<number> {
  const ids = seedIds(seed)
  let made = 0
  for (const s of seed.library.secrets) {
    const projectId = idFor(ids.projects, s.project, 'project')
    const id = secretId(s.project, s.name)
    const createdById = idFor(ids.people, s.createdBy, 'person')
    const at = seedTime(deps.now, s.at)
    const created = await store.createSecret(
      { type: 'project', id: projectId },
      {
        id, name: s.name, kind: 'TEXT', description: s.description, issuer: s.issuer, renewAt: s.renewAt, rotateBy: null, createdById,
        ciphertext: deps.sealSecret(id, projectId, 'demo: no value is held'),
      },
      { secretName: s.name, secretId: id, action: 'SET', byUserId: createdById, runId: null, at },
    )
    if (created) made += 1
  }
  return made
}
