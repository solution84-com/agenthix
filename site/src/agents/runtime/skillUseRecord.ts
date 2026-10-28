/**
 * The run's record of the skills it used (spec part 5, data board 13): one entry per staged name, with where it came
 * from and the fingerprint of exactly what was staged. hq reads it back on the run row; it is never an input to
 * staging. Writing it is best effort: a failure is logged and the run goes on.
 */
import type { RunSkillUse } from '@agenthix/core'
import { prisma } from '#db'
import { Logger } from '../../server/utils/logger'
import type { StagedSkill } from './skillStaging'

const logger = new Logger('SkillUseRecord')

export function skillUsesOf(staged: readonly StagedSkill[]): RunSkillUse[] {
  const uses: RunSkillUse[] = []
  for (const s of staged) {
    if (!s.fingerprint) continue // could not be read back: nothing true to record
    uses.push({
      name: s.name, source: s.source, fingerprint: s.fingerprint,
      ...(s.path ? { path: s.path } : {}),
    })
  }
  return uses
}

export async function recordSkillsUsed(runId: string, staged: readonly StagedSkill[]): Promise<void> {
  const uses = skillUsesOf(staged)
  if (uses.length === 0) return
  try {
    await prisma.agentRun.update({ where: { id: runId }, data: { skillsUsed: uses } })
  } catch (err) {
    logger.warn(`could not record the skills run ${runId} used: ${(err as Error).message}`)
  }
}
