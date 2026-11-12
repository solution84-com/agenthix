import { readdir, readFile } from 'node:fs/promises'
import { demoDataDir, loadDemoSeed } from '@agenthix/core'
import { prisma } from 'wasp/server'
import { KERNEL_HANDLE } from '../../agents/kernelGuards'
import { Logger } from '../../server/utils/logger'
import { hqSeedDeps } from './deps'
import { prismaSecretsDb } from '../../secrets/db'
import { seedHqDemo } from './index'
import { seedSecrets } from './secrets'
import { checkSeedPictures, drawSeedPictures } from './pictures'
import { getRobots } from '../../pictures/robots'

const logger = new Logger('DemoSeed')

const TRANSACTION = { timeout: 120_000, maxWait: 10_000 }

/**
 * In demo mode, hq that starts with no users seeds the sample organisation instead of issuing a first-admin link
 * (adr-0186). Run after the default site and the built-in agent exist, which the seed places everything on.
 * Fails closed: when the data or the site is wrong it throws, and start-up stops rather than serving an empty demo.
 */
export async function seedDemoOrganisation(): Promise<void> {
  const seed = await loadDemoSeed(demoDataDir(process.env), { list: dir => readdir(dir), read: file => readFile(file, 'utf8') })
  const site = await prisma.executionSite.findFirst({ where: { isDefault: true }, select: { id: true, siteId: true } })
  if (!site) throw new Error('The demo needs hq\'s own site: HQ_PAIRING_SECRET is not set, or the site was not made.')
  const kernel = await prisma.agent.findUnique({ where: { handle: KERNEL_HANDLE }, select: { id: true } })
  if (!kernel) throw new Error('The demo needs the built-in agent, which hq makes at start.')
  const pictures = await checkSeedPictures(seed, (await getRobots())?.names ?? null)
  const started = Date.now()
  const deps = hqSeedDeps(new Date())
  await prisma.$transaction(tx => seedHqDemo(tx, seed, { siteId: site.id, siteLogicalId: site.siteId, kernelId: kernel.id }, deps), TRANSACTION)
  await seedSecrets(seed, prismaSecretsDb, deps)
  const org = await prisma.org.findFirst({ select: { id: true } })
  // Drawn once the rows are written, so a picture's files are never left behind by a seed that rolled back.
  const drawn = org ? await drawSeedPictures(pictures, org.id) : 0
  await prisma.siteConfig.updateMany({ data: { bootstrapRequired: false } })
  logger.info(`Seeded the sample organisation: ${seed.organisation.people.length} people, ${seed.organisation.projects.length} projects, ${seed.organisation.tasks.length} tasks, ${drawn} of ${pictures.length} pictures (${Date.now() - started} ms).`)
}
