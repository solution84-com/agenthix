/**
 * The live dependencies of opening a task's attachment: the row, `/file-link`'s access rule, hq's relay, a look at the
 * file's first bytes on hq's disk (only to choose its kind; nothing read is sent anywhere), and the one ticket issuer.
 */
import fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import path from 'node:path'
import { prisma } from 'wasp/server'
import { TEXT_SNIFF_BYTES, looksLikeText } from '@agenthix/core'
import { issueFileTicket } from '../relays'
import { getHqStorageRoot } from '../server/hqStoragePaths'
import { uploadAccess } from '../server/files/uploadAccess'
import { connectedHqRelay } from '../server/files/uploadLinkDeps'
import type { OpenTaskAttachmentDeps } from './openTaskAttachment'
import { hqMachineName } from '../sites/defaultSite'
import { displayRelayName } from '../shared/siteName'

/** An attachment's upload path, decoded, as `uploadAccess` and an `upload` ticket name it. */
export const attachmentUploadPath = (a: { taskId: string; uuid: string; fileName: string }) =>
  `/files/task/${a.taskId}/${a.uuid}/${a.fileName}`

async function find(attachmentId: string) {
  const row = await prisma.taskAttachment.findUnique({ where: { id: attachmentId }, select: { taskId: true, uuid: true, fileName: true } })
  return row && { path: attachmentUploadPath(row), name: row.fileName }
}

async function access(uploadPath: string, userId: string) {
  const allowed = await uploadAccess(uploadPath, userId)
  return allowed.ok ? { size: allowed.stat.size, mtimeMs: allowed.stat.mtimeMs } : null
}

/** Read only after `uploadAccess` passed; opened without following a link, as hq's relay opens it. */
async function firstBytesLookLikeText(uploadPath: string): Promise<boolean> {
  const [, , taskId, uuid, ...name] = uploadPath.slice(1).split('/')
  const file = path.join(await fs.realpath(getHqStorageRoot()), 'tasks', taskId, uuid, ...name)
  const handle = await fs.open(file, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
  try {
    const sample = Buffer.alloc(TEXT_SNIFF_BYTES)
    const { bytesRead } = await handle.read(sample, 0, TEXT_SNIFF_BYTES, 0)
    return looksLikeText(sample.subarray(0, bytesRead))
  } finally {
    await handle.close()
  }
}

export const openTaskAttachmentDeps: OpenTaskAttachmentDeps = {
  find,
  access,
  hqRelay: connectedHqRelay,
  hqRelayName: () => displayRelayName({ name: hqMachineName(), isHq: true }),
  looksLikeText: firstBytesLookLikeText,
  issue: issueFileTicket,
}
