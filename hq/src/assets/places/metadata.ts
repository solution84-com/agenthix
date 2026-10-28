/**
 * What hq writes into a skill's files when it publishes a version (spec part 2 *Editing: draft, then publish*; part 4,
 * F3 and FV2), a Library skill's and a place skill's alike, so the files and hq's record of the version agree: the
 * version in `SKILL.md`'s front matter (`metadata.version: "4"`, and a top-level `version:` too when the file has one,
 * since that one is read first), in a `package.json` beside it when there is one and the version is SemVer, and for a
 * skill added from the Library the identity it came from (`metadata.identity: agenthix/pm-sprint-planning`). Every other
 * key, the body and every other file are kept as written. Pure.
 */
import { isMap, parseDocument } from 'yaml'
import { ASSET_MANIFEST_FILE, isSemVer } from '@agenthix/core'
import type { PackageFile } from '../../library/packages/packageZip'
import { SKILL_FILE } from '../skillFile'
import { LifecycleError } from '../lifecycle/errors'

const NOTHING = 'Nothing was changed.'
const BOM = String.fromCharCode(0xfeff)

export type SkillMetadata = { version: string; identity?: string }

function withHeader(text: string, meta: SkillMetadata): string {
  const clean = text.startsWith(BOM) ? text.slice(BOM.length) : text
  const lines = clean.split(/\r\n|\r|\n/)
  const opened = lines[0]?.trimEnd() === '---'
  const close = opened ? lines.findIndex((l, i) => i > 0 && l.trimEnd() === '---') : -1
  if (opened && close === -1) throw new LifecycleError(`${SKILL_FILE}'s front matter is never closed with ---. ${NOTHING}`)
  const header = opened ? lines.slice(1, close).join('\n') : ''
  const body = opened ? lines.slice(close + 1).join('\n') : clean
  const doc = parseDocument(header, { uniqueKeys: true })
  if (doc.errors.length) throw new LifecycleError(`${SKILL_FILE}'s front matter is not valid YAML. ${NOTHING}`)
  if (doc.contents !== null && !isMap(doc.contents)) throw new LifecycleError(`${SKILL_FILE}'s front matter is not a list of keys. ${NOTHING}`)
  const existing = doc.get('metadata')
  if (existing !== undefined && existing !== null && !isMap(existing)) {
    throw new LifecycleError(`${SKILL_FILE}'s metadata is not a list of keys, so hq can't write the version into it. ${NOTHING}`)
  }
  if (existing === null) doc.delete('metadata')
  if (doc.has('version')) doc.set('version', meta.version)
  doc.setIn(['metadata', 'version'], meta.version)
  if (meta.identity) doc.setIn(['metadata', 'identity'], meta.identity)
  return `---\n${doc.toString().replace(/\n+$/, '')}\n---\n${opened ? body : `\n${body}`}`
}

function withManifestVersion(text: string, version: string): string {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new LifecycleError(`${ASSET_MANIFEST_FILE} beside ${SKILL_FILE} is not valid JSON, so hq can't write the version into it. ${NOTHING}`)
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new LifecycleError(`${ASSET_MANIFEST_FILE} beside ${SKILL_FILE} is not a list of keys, so hq can't write the version into it. ${NOTHING}`)
  }
  return `${JSON.stringify({ ...raw, version }, null, 2)}\n`
}

/** The files with the version written in; refused when there is no `SKILL.md`, or what it is written into is broken. */
export function withSkillMetadata(files: PackageFile[], meta: SkillMetadata): PackageFile[] {
  const md = files.find(f => f.path === SKILL_FILE)
  if (!md) throw new LifecycleError(`A skill needs a ${SKILL_FILE}. ${NOTHING}`)
  const content = Buffer.from(withHeader(md.content.toString('utf-8'), meta), 'utf-8')
  // A place's plain number ("4") is no SemVer, so a package.json beside a place skill keeps its own version.
  const manifest = isSemVer(meta.version) ? files.find(f => f.path === ASSET_MANIFEST_FILE) : undefined
  return files.map(f => {
    if (f === md) return { path: f.path, content }
    if (f === manifest) return { path: f.path, content: Buffer.from(withManifestVersion(f.content.toString('utf-8'), meta.version), 'utf-8') }
    return f
  })
}
