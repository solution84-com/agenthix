/**
 * Until delivery reads the installed assets themselves, a run still receives a Library skill as a copy in the
 * organisation's or an agent's package, as before the asset layer. A copy is made from the asset's pinned version and
 * says where it came from (`installed_from: publisher/name`), so removing the asset removes its copies and nothing
 * else. Its front matter is written one line per key, with nothing that could open another key.
 */
import { ASSET_MANIFEST_FILE, formatAssetIdentity, parseSemVer } from '@agenthix/core'
import type { PackageFileInput } from '../packages/packageStore'
import type { PackageFile } from '../library/packages/packageZip'
import { SKILL_FILE, readSkillMd, skillDescription, skillTitle } from './skillFile'

const oneLine = (text: string) => text.replace(/\s+/g, ' ').replace(/-{3,}/g, '—').trim()

export type SkillCopy = { slug: string; identity: string; files: PackageFileInput[] }

export function skillCopy(asset: { publisher: string; name: string }, version: string, files: PackageFile[]): SkillCopy {
  const identity = formatAssetIdentity(asset)
  const md = readSkillMd(files.find(f => f.path === SKILL_FILE)?.content.toString('utf-8') ?? '')
  const major = parseSemVer(version)?.major ?? 1
  const header = [
    `name: ${oneLine(skillTitle(md, asset.name))}`,
    `slug: ${asset.name}`,
    `description: ${oneLine(skillDescription(md))}`,
    `version: ${major}`,
    `installed_from: ${identity}`,
  ]
  const skillMd = { path: SKILL_FILE, content: Buffer.from(`---\n${header.join('\n')}\n---\n\n${md.body}`, 'utf-8') }
  const rest = files.filter(f => f.path !== SKILL_FILE && f.path !== ASSET_MANIFEST_FILE)
  return { slug: asset.name, identity, files: [skillMd, ...rest] }
}
