/** Boot: the built-in skills in hq's image installed as `agenthix/<name>` assets (adr-0156), in one transaction. */
import { prisma } from 'wasp/server'
import { assertAssetDir } from '../../server/hqAssets'
import { Logger } from '../../server/utils/logger'
import { installBuiltInSkills } from './install'
import { platformSkillsDir, readPlatformSkills } from './platformSkills'

const logger = new Logger('BuiltInSkills')

export async function ensureBuiltInSkills(): Promise<void> {
  const dir = platformSkillsDir()
  await assertAssetDir(dir)
  const { skills, problems } = await readPlatformSkills(dir)
  for (const problem of problems) logger.error(`Built-in skill not installed: ${problem}`)
  const { installed, removed } = await prisma.$transaction(tx => installBuiltInSkills(tx, skills), { timeout: 30_000, maxWait: 10_000 })
  for (const s of installed) if (s.outcome !== 'same') logger.info(`Built-in skill agenthix/${s.name} ${s.outcome === 'new' ? 'installed' : 'updated'} at ${s.version}.`)
  for (const identity of removed) logger.info(`Built-in skill ${identity} is no longer shipped, and was removed.`)
}
