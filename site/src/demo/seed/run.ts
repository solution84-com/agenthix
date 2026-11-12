import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { demoDataDir, loadDemoSeed } from '@agenthix/core'
import { prisma } from '#db'
import { Logger } from '../../server/utils/logger'
import { getArtefactsDir, getFilesDir, getTaskDir, getWorkspaceDir, knowledgePagesDir } from '../../server/storage/paths'
import { seedFiles, seedSiteRows } from './index'
import type { SiteSeedDeps } from './types'

const logger = new Logger('DemoSeed')

const TRANSACTION = { timeout: 60_000, maxWait: 10_000 }

/**
 * In demo mode, a site that starts with no sessions seeds its part of the sample organisation (adr-0186). It needs
 * nothing from hq: the ids come from the data, so it runs before the site connects. Fails closed: bad data stops
 * start-up. A site that already holds sessions is left alone, so a restart does not seed twice.
 */
export async function seedDemoSite(siteId: string): Promise<void> {
  if ((await prisma.agentSession.count()) > 0) {
    logger.info('Sessions are already here; the sample organisation is not seeded again.')
    return
  }
  const seed = await loadDemoSeed(demoDataDir(process.env), { list: dir => readdir(dir), read: file => readFile(file, 'utf8') })
  const deps: SiteSeedDeps = {
    now: new Date(),
    siteId,
    paths: {
      projectFilesDir: projectId => getFilesDir('project', projectId),
      workspaceDir: (projectId, workspaceId) => getWorkspaceDir({ ownerType: 'project', ownerId: projectId, id: workspaceId }),
      taskDir: (projectId, taskId) => getTaskDir('project', projectId, taskId),
      knowledgePagesDir,
      artefactsDir: projectId => getArtefactsDir('project', projectId),
    },
    async writeFile(file, content) {
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, content)
    },
    async makeDir(dir) {
      await mkdir(dir, { recursive: true })
    },
  }
  await prisma.$transaction(tx => seedSiteRows(tx, seed, deps), TRANSACTION)
  await seedFiles(seed, deps)
  logger.info(`Seeded the sample organisation's part: ${seed.activity.sessions.length} sessions, ${seed.site.workspaces.length} workspaces, ${seed.site.knowledge.length} Knowledge folders.`)
}
