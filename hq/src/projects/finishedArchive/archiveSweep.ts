/**
 * Archives finished tasks (agents-own-schedule spec §3): a task in a done
 * column, with no run pending, whose time in done has passed its project's
 * setting. Hourly, started once from setup like hq's other background sweeps;
 * timers are unref'd so they never hold the process open.
 *
 * One query per setting value (three at most), each answered from the
 * `doneAt` index. Each task goes through the same archive as a person's click.
 */
import { prisma } from 'wasp/server'
import { archiveTask } from '../taskService'
import { notifyProjectBoards } from '../boardNotify'
import { Logger } from '../../server/utils/logger'
import { ARCHIVE_DAY_CHOICES, DEFAULT_ARCHIVE_DAYS } from './archiveSetting'

const logger = new Logger('ArchiveSweep')
const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
/** A backlog beyond this is cleared over the next sweeps rather than in one. */
const BATCH = 500

export async function sweepFinishedTasks(now: Date = new Date()): Promise<number> {
  const org = await prisma.org.findFirst({ select: { archiveFinishedAfterDays: true } })
  const orgDays = org ? org.archiveFinishedAfterDays : DEFAULT_ARCHIVE_DAYS
  const projects = new Set<string>()
  let archived = 0
  for (const days of ARCHIVE_DAY_CHOICES) {
    const tasks = await prisma.task.findMany({
      where: {
        archived: false,
        state: 'DONE',
        runState: 'RUN_NONE',
        doneAt: { lt: new Date(now.getTime() - days * DAY_MS) },
        project: {
          OR: [{ archiveFinishedAfterDays: days }, ...(orgDays === days ? [{ archiveFinishedAfterDays: null }] : [])],
        },
      },
      select: { id: true, projectId: true },
      take: BATCH,
    })
    for (const task of tasks) {
      try {
        await archiveTask(task.id)
        archived++
        projects.add(task.projectId)
      } catch (err) {
        logger.warn(`could not archive task ${task.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }
  if (projects.size > 0) await notifyProjectBoards([...projects])
  if (archived > 0) logger.info(`archived ${archived} finished task(s)`)
  return archived
}

let timer: NodeJS.Timeout | null = null

export function startArchiveSweep(intervalMs = HOUR_MS): void {
  if (timer) return
  const run = () => sweepFinishedTasks().catch(err => logger.error(`sweep failed: ${err instanceof Error ? err.message : String(err)}`))
  void run()
  timer = setInterval(run, intervalMs)
  timer.unref?.()
}

export function stopArchiveSweep(): void {
  if (timer) clearInterval(timer)
  timer = null
}
