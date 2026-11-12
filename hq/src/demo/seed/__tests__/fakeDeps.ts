import type { SeedDeps } from '../index'
import { withSkillMetadata } from '../../../assets/places/metadata'
import { FIRST_VERSION } from '../placeSkills'

export const NOW = new Date('2026-11-11T12:00:00.000Z')

/** hq's seed dependencies with no database, keys or disk: what each was asked is kept for the test to read. */
export function deps(extra: Partial<SeedDeps> = {}): SeedDeps & { sealed: string[]; secrets: { id: string; project: string }[]; instructions: string[]; skills: string[]; passwords: string[] } {
  const sealed: string[] = []
  const secrets: { id: string; project: string }[] = []
  const instructions: string[] = []
  const skills: string[] = []
  const passwords: string[] = []
  let n = 0
  return {
    now: NOW,
    hashPassword: async plain => { passwords.push(plain); return `hash(${plain})` },
    newPassword: () => `random-${(n += 1)}`,
    seal: plain => { sealed.push(plain); return `sealed(${plain.length})` },
    sealSecret: (id, project) => { secrets.push({ id, project }); return Buffer.from('ciphertext') },
    writeAgentInstructions: async (_db, agentId) => { instructions.push(agentId) },
    publishSkill: async (_db, skill) => {
      skills.push(skill.name)
      // As hq's own publish does (deps.ts): the Library's first version, under the organisation's publisher name.
      return { identity: `fernhill-co/${skill.name}`, version: FIRST_VERSION, files: withSkillMetadata(skill.files, { version: FIRST_VERSION }) }
    },
    storeFiles: async (_db, files) => `digest-of-${files.map(f => f.path).join(',')}`,
    executorImageDigest: `sha256:${'a'.repeat(64)}`,
    ...extra,
    sealed, secrets, instructions, skills, passwords,
  }
}
