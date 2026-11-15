import { type UploadTaskAttachment } from 'wasp/server/operations'
import { HttpError } from 'wasp/server'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'
import { getTaskAttachmentDir } from '../server/hqStoragePaths'
import { attachmentFileNameProblem, ATTACHMENT_MAX_BYTES, ATTACHMENT_TOO_LARGE } from '../shared/attachmentFileName'
import { requireMayWorkInProject } from './membership'

export const uploadTaskAttachment: UploadTaskAttachment<
  { taskId: string; filename: string; dataUrl: string; label?: string },
  { attachmentId: string; path: string }
> = async ({ taskId, filename, dataUrl, label }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')

  const task = await context.entities.Task.findUnique({ where: { id: taskId } })
  if (!task) throw new HttpError(404, 'Task not found')

  // The same entitlement the read side applies (plan §8.3b). Closing the read
  // while leaving the write open is half a boundary: anyone signed in could
  // otherwise land ten megabytes of arbitrary content on any task in the org.
  await requireMayWorkInProject(task.projectId, context.user.id, "Attaching a file to this task")

  const nameProblem = attachmentFileNameProblem(filename)
  if (nameProblem) throw new HttpError(400, nameProblem)

  // Parse the data URL — accept any MIME type
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) throw new HttpError(400, 'Invalid data URL — expected data:<mime>;base64,<data>')
  const [, , b64] = match
  const buf = Buffer.from(b64, 'base64')
  if (buf.length > ATTACHMENT_MAX_BYTES) throw new HttpError(400, ATTACHMENT_TOO_LARGE)

  const uuid = randomUUID()
  const dir = getTaskAttachmentDir(taskId, uuid)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, filename), buf)

  const attachment = await context.entities.TaskAttachment.create({
    data: { taskId, uuid, fileName: filename, fileSizeBytes: buf.length, label: label ?? null },
  })

  // The path a client asks `/file-link` for: hq's relay serves the file on the ticket hq signs for it (adr-0153).
  const uploadPath = `/files/task/${taskId}/${uuid}/${encodeURIComponent(filename)}`

  return { attachmentId: attachment.id, path: uploadPath }
}
