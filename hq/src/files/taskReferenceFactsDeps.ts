/**
 * The live dependencies of a task chip's facts: the task by key or id, the task page's access rule (a member of its
 * project), the one chip facts path for a working file, and an attachment's row and facts as opening it reads them
 * (`/file-link`'s access rule, then a look at its first bytes on hq's disk to choose its kind; nothing read leaves hq).
 */
import { prisma } from 'wasp/server'
import { chooseFileKind, fileVersion } from '@agenthix/core'
import { isProjectMember } from '../projects/membership'
import { isYourSpace } from '../projects/personalProject'
import { TASK_KEY } from '../shared/taskReferences'
import { fileFacts } from './fileFacts'
import { openFileDeps } from './openFileDeps'
import { attachmentUploadPath, openTaskAttachmentDeps } from './openTaskAttachmentDeps'
import type { FileFactsAnswer } from './fileFactsAnswer'
import type { FoundAttachment, FoundTask, TaskReferenceDeps } from './taskReferenceFacts'

const TASK_SELECT = {
  id: true, number: true, title: true, state: true, projectId: true,
  project: { select: { key: true, personalOwnerId: true, personalSpace: true } },
} as const

async function findTask(task: string): Promise<FoundTask | null> {
  let row
  if (TASK_KEY.test(task)) {
    const [, projectKey, number] = /^(.+)-(\d+)$/.exec(task)!
    row = await prisma.task.findFirst({ where: { number: Number(number), project: { key: projectKey } }, select: TASK_SELECT })
  } else {
    row = await prisma.task.findUnique({ where: { id: task }, select: TASK_SELECT })
  }
  if (!row) return null
  return {
    id: row.id, key: `${row.project.key}-${row.number}`, title: row.title, state: row.state,
    projectId: row.projectId, yourSpace: isYourSpace(row.project),
  }
}

async function findAttachment(taskId: string, name: string): Promise<FoundAttachment | null> {
  const row = await prisma.taskAttachment.findFirst({
    where: { taskId, fileName: name }, orderBy: { createdAt: 'desc' }, select: { id: true, taskId: true, uuid: true, fileName: true },
  })
  return row && { id: row.id, uploadPath: attachmentUploadPath(row), name: row.fileName }
}

async function attachmentFacts(attachment: FoundAttachment, userId: string): Promise<FileFactsAnswer> {
  const stat = await openTaskAttachmentDeps.access(attachment.uploadPath, userId)
  if (!stat) return { state: 'gone' }
  const choice = chooseFileKind(attachment.name, await openTaskAttachmentDeps.looksLikeText(attachment.uploadPath))
  return {
    state: 'ready',
    facts: {
      name: attachment.name, size: stat.size, version: fileVersion(stat.size, stat.mtimeMs),
      contentType: choice.contentType, kind: choice.kind, ...(choice.language ? { language: choice.language } : {}),
    },
  }
}

export const taskReferenceFactsDeps: TaskReferenceDeps = {
  findTask,
  canSee: isProjectMember,
  fileFacts: (refs, userId) => fileFacts(refs, userId, openFileDeps),
  findAttachment,
  attachmentFacts,
}
