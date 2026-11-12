import type { Prisma } from '@prisma/client'
import type { KnowledgeOwnerRef } from '@agenthix/core'

export type SeedDb = Prisma.TransactionClient

/** Where the site keeps what the seed writes, and how to write it: given so a test needs neither a disk nor a database. */
export type SiteSeedDeps = {
  now: Date
  /** This installation's own id (`SiteConfig.siteId`), which a workspace's row names. */
  siteId: string
  paths: {
    projectFilesDir(projectId: string): string
    workspaceDir(projectId: string, workspaceId: string): string
    taskDir(projectId: string, taskId: string): string
    knowledgePagesDir(owner: KnowledgeOwnerRef): string
    artefactsDir(projectId: string): string
  }
  /** Makes the folders on the way and writes the file; an existing file is replaced. */
  writeFile(path: string, content: Buffer): Promise<void>
  makeDir(path: string): Promise<void>
}
