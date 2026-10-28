/**
 * The run's record of the skills it used (spec part 5, data board 13): one entry per staged name, with where it came
 * from (identity and version, or place and path, and the person for their own skill) and the fingerprint of exactly
 * what was staged. A skill hq named that was not staged is recorded too, with `refused` saying why (security review
 * H3), so a changed file is never silently dropped. hq reads it back on the run row; it is never an input to staging.
 * Writing it is best effort: a failure is logged and the run goes on.
 */
import type { RunSkillUse } from '@agenthix/core'
import { prisma } from '#db'
import { Logger } from '../../server/utils/logger'
import type { StagingResult } from './skillStaging'

const logger = new Logger('SkillUseRecord')

export function skillUsesOf(result: StagingResult): RunSkillUse[] {
  const uses: RunSkillUse[] = result.staged.map(s => ({
    name: s.name, source: s.source, fingerprint: s.fingerprint,
    ...(s.identity ? { identity: s.identity } : {}),
    ...(s.version ? { version: s.version } : {}),
    ...(s.placeId ? { placeId: s.placeId } : {}),
    ...(s.path ? { path: s.path } : {}),
    ...(s.personId ? { personId: s.personId } : {}),
  }))
  for (const r of result.refused) {
    uses.push({
      name: r.name ?? '', source: r.source, fingerprint: r.fingerprint,
      ...(r.origin.identity ? { identity: r.origin.identity } : {}),
      ...(r.origin.version ? { version: r.origin.version } : {}),
      ...(r.origin.placeId ? { placeId: r.origin.placeId } : {}),
      ...(r.origin.path ? { path: r.origin.path } : {}),
      ...(r.origin.personId ? { personId: r.origin.personId } : {}),
      refused: r.reason,
    })
  }
  return uses
}

export async function recordSkillsUsed(runId: string, result: StagingResult): Promise<void> {
  const uses = skillUsesOf(result)
  if (uses.length === 0) return
  try {
    await prisma.agentRun.update({ where: { id: runId }, data: { skillsUsed: uses } })
  } catch (err) {
    logger.warn(`could not record the skills run ${runId} used: ${(err as Error).message}`)
  }
}
