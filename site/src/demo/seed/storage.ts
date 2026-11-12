import { KNOWLEDGE_ORG_OWNER_ID, idFor, seedIds, seedTime, type DemoSeed } from '@agenthix/core'
import type { SeedDb, SiteSeedDeps } from './types'

/** The site's workspaces (rows and folders) and the files hq's data says are there. */
export async function seedWorkspaces(db: SeedDb, seed: DemoSeed, deps: SiteSeedDeps): Promise<void> {
  const ids = seedIds(seed)
  for (const w of seed.site.workspaces) {
    const projectId = idFor(ids.projects, w.project, 'project')
    const createdAt = seedTime(deps.now, w.at)
    await db.workspace.create({ data: { id: w.id, name: w.name, ownerType: 'project', ownerId: projectId, siteId: deps.siteId, createdAt } })
    if (w.repoUrl) await db.repoAttachment.create({ data: { ownerType: 'project', ownerId: projectId, workspaceId: w.id, repoUrl: w.repoUrl, createdAt } })
  }
}

/** Files on the disk: workspace folders and their files, project files, artefacts, task attachments and Knowledge pages. Written after the rows. */
export async function seedFiles(seed: DemoSeed, deps: SiteSeedDeps): Promise<void> {
  const ids = seedIds(seed)
  for (const w of seed.site.workspaces) {
    const dir = deps.paths.workspaceDir(idFor(ids.projects, w.project, 'project'), w.id)
    await deps.makeDir(dir)
    for (const f of w.files ?? []) await deps.writeFile(`${dir}/${f.path}`, Buffer.from(f.content, 'utf-8'))
  }
  for (const f of seed.site.files) {
    await deps.writeFile(`${deps.paths.projectFilesDir(idFor(ids.projects, f.project, 'project'))}/${f.path}`, Buffer.from(f.content, 'utf-8'))
  }
  for (const a of seed.site.artefacts) {
    await deps.writeFile(`${deps.paths.artefactsDir(idFor(ids.projects, a.project, 'project'))}/${a.name}`, Buffer.from(a.content, 'utf-8'))
  }
  for (const f of seed.site.attachmentFiles) {
    const task = seed.organisation.tasks.find(t => t.key === f.task)!
    const dir = deps.paths.taskDir(idFor(ids.projects, task.project, 'project'), idFor(ids.tasks, f.task, 'task'))
    await deps.writeFile(`${dir}/${f.uuid}/${f.fileName}`, Buffer.from(f.base64, 'base64'))
  }
  for (const k of seed.site.knowledge) {
    const owner = 'project' in k.owner
      ? { ownerType: 'project' as const, ownerId: idFor(ids.projects, k.owner.project, 'project') }
      : { ownerType: 'org' as const, ownerId: KNOWLEDGE_ORG_OWNER_ID }
    const dir = deps.paths.knowledgePagesDir(owner)
    for (const p of k.pages) await deps.writeFile(`${dir}/${p.path}`, Buffer.from(p.content, 'utf-8'))
  }
}
