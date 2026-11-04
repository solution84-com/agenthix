/**
 * What a `location.writeSkill` stream carries, checked before anything is written (site protocol 1.11): a contents
 * list and each file's bytes, every file matching its entry, the whole matching the fingerprint hq named, within
 * staging's bounds, with a `SKILL.md` and no hidden, climbing or clashing path. hq is trusted to have checked who may
 * write; what it sends is still checked here, since it decides what a run will read.
 */
import { createHash } from 'node:crypto'
import { skillHasTooManyEntries, skillIsTooDeep } from '../../packages/skillBounds'
import {
  PACKAGE_FORMAT_VERSION, SKILL_TREE_MAX_DEPTH, SKILL_TREE_MAX_ENTRIES, SKILL_WRITE_MAX_BYTES, assetFingerprintInput,
  checkAssetFileList, isValidPackagePath,
} from '@agenthix/core'

export const SKILL_FILE = 'SKILL.md'

export type TransferredFile = { path: string; content: Buffer }

export class SkillTransferError extends Error {
  constructor(readonly code: 'invalid' | 'too_large' | 'too_many', message: string) {
    super(message)
  }
}

const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex')

/** The files the body carries, in path order, or a `SkillTransferError` saying what is wrong with it. */
export function readSkillTransfer(body: Buffer, digest: string): TransferredFile[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(body.toString('utf-8'))
  } catch {
    throw new SkillTransferError('invalid', 'the files are not a skill folder transfer')
  }
  const { contents, data } = (parsed ?? {}) as { contents?: unknown; data?: unknown }
  const list = (contents as { files?: unknown } | null)?.files
  if ((contents as { formatVersion?: unknown } | null)?.formatVersion !== PACKAGE_FORMAT_VERSION || !Array.isArray(list)
    || typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new SkillTransferError('invalid', 'the files are not a skill folder transfer')
  }
  if (list.length > SKILL_TREE_MAX_ENTRIES) throw new SkillTransferError('too_many', `the skill holds more than ${SKILL_TREE_MAX_ENTRIES} entries`)
  const bytes = data as Record<string, unknown>
  if (Object.keys(bytes).length !== list.length) throw new SkillTransferError('invalid', 'the files and their contents list differ')

  const files: TransferredFile[] = []
  let total = 0
  for (const entry of list as { path?: unknown; sha256?: unknown }[]) {
    const p = entry?.path
    if (typeof p !== 'string' || !isValidPackagePath(p) || typeof entry.sha256 !== 'string') {
      throw new SkillTransferError('invalid', 'a file has a path a skill may not hold')
    }
    const encoded = Object.prototype.hasOwnProperty.call(bytes, p) ? bytes[p] : undefined
    if (typeof encoded !== 'string') throw new SkillTransferError('invalid', `"${p}" is in the contents list but not sent`)
    const content = Buffer.from(encoded, 'base64')
    total += content.length
    if (total > SKILL_WRITE_MAX_BYTES) throw new SkillTransferError('too_large', `the skill is larger than ${SKILL_WRITE_MAX_BYTES} bytes`)
    if (sha256(content) !== entry.sha256) throw new SkillTransferError('invalid', `"${p}" is not the file its contents entry names`)
    files.push({ path: p, content })
  }
  const paths = files.map(f => f.path)
  if (checkAssetFileList(paths).length > 0) throw new SkillTransferError('invalid', 'two files would be one on disk, or a path is not one a skill may hold')
  if (skillIsTooDeep(paths)) throw new SkillTransferError('too_many', `the skill's folders nest deeper than ${SKILL_TREE_MAX_DEPTH}`)
  if (skillHasTooManyEntries(paths)) throw new SkillTransferError('too_many', `the skill holds more than ${SKILL_TREE_MAX_ENTRIES} entries`)
  if (!paths.includes(SKILL_FILE)) throw new SkillTransferError('invalid', `the skill has no ${SKILL_FILE}`)
  const fingerprint = sha256(assetFingerprintInput(files.map(f => ({ path: f.path, sha256: sha256(f.content) }))))
  if (fingerprint !== digest) throw new SkillTransferError('invalid', 'the files are not the ones hq named')
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}
