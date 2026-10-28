/**
 * What hq writes into a place skill's `SKILL.md` front matter (spec part 4, F3 and FV2): the version it was published
 * as (`metadata.version: "4"`), and for a skill added from the Library the identity it came from
 * (`metadata.identity: agenthix/pm-sprint-planning`). Every other key and the body are kept as written. Pure.
 */
import { isMap, parseDocument } from 'yaml'
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
  doc.setIn(['metadata', 'version'], meta.version)
  if (meta.identity) doc.setIn(['metadata', 'identity'], meta.identity)
  return `---\n${doc.toString().replace(/\n+$/, '')}\n---\n${opened ? body : `\n${body}`}`
}

/** The files with the metadata written into `SKILL.md`; refused when there is none, or its front matter is broken. */
export function withSkillMetadata(files: PackageFile[], meta: SkillMetadata): PackageFile[] {
  const md = files.find(f => f.path === SKILL_FILE)
  if (!md) throw new LifecycleError(`A skill needs a ${SKILL_FILE}. ${NOTHING}`)
  const content = Buffer.from(withHeader(md.content.toString('utf-8'), meta), 'utf-8')
  return files.map(f => (f === md ? { path: f.path, content } : f))
}
