/**
 * What an arrived package holds (spec part 2 *Identity* and *Self-contained packages*, part 3 *The protocol* 1): its
 * manifest (format 2, core's parser), or, for a plain skill folder, what its `SKILL.md` says; and, for a template,
 * every skill inside it. The manifest's `publisher` is only a claim, kept as `claim`: the pipeline takes the
 * publisher from the verified signer (`decide.ts`).
 */
import {
  ASSET_MANIFEST_FILE, AssetManifestError, SUITED_TO_MAX, isAssetName, isSemVer, parseAssetManifest, roleSkillName,
  type AssetKind, type BasedOnLine,
} from '@agenthix/core'
import type { PackageFile } from '../../library/packages/packageZip'
import { SKILL_FILE, skillDescription, skillMdOf, skillMdVersion, skillTitle, type SkillMd } from '../skillFile'
import { PackageReadError, type ArrivedPackage } from './archive'

export type PackagePart = {
  kind: AssetKind
  name: string
  version: string
  /** The publisher the manifest names; null for a plain folder, which names none. */
  claim: string | null
  title: string
  description: string
  basedOn: BasedOnLine[]
  licence: string | null
  suitedTo: string[]
  /** By path relative to the asset's own folder; a skill inside a template has its own. */
  files: PackageFile[]
  /** A plain skill folder with no manifest: it can't carry a signature (part 3, *The protocol* 1). */
  plain: boolean
  /** A template's own role skill, named under it (`<template>/<skill>`); false for a shared skill and a package. */
  role: boolean
}

export type PackageParts = PackagePart & { embedded: PackagePart[] }

const EMBEDDED_ROOT = 'skills/'
const DEFAULT_VERSION = '1.0.0'

function manifestOf(files: PackageFile[], where: string) {
  const file = files.find(f => f.path === ASSET_MANIFEST_FILE)
  if (!file) return null
  let raw: unknown
  try {
    raw = JSON.parse(file.content.toString('utf-8'))
  } catch {
    throw new PackageReadError(`This package can't be read: ${where}package.json is not valid JSON.`)
  }
  if (raw && typeof raw === 'object' && (raw as { format?: unknown }).format === 1) {
    throw new PackageReadError(`This package was made for an older hq (package format 1). Export it again from this version of hq.`)
  }
  try {
    return parseAssetManifest(raw)
  } catch (err) {
    if (err instanceof AssetManifestError) throw new PackageReadError(`This package can't be read: ${where}${err.message}.`)
    throw err
  }
}

/** A plain folder's version: SemVer as its SKILL.md writes it, `1.2` as 1.2.0, or 1.0.0 when it says none. */
function plainVersion(raw: string | null): string {
  if (raw === null) return DEFAULT_VERSION
  const version = /^\d+\.\d+$/.test(raw) ? `${raw}.0` : raw
  if (!isSemVer(version)) throw new PackageReadError(`This skill's version “${raw.slice(0, 40)}” isn't a version number like 1.2.0.`)
  return version
}

/** A plain folder's *suited to* hint, `suitedTo` in its front matter: a hint only, so one that isn't a list of at most 10 different lowercase words is dropped, never refused. */
export function plainSuitedTo(md: SkillMd | null): string[] {
  const raw = md?.header?.suitedTo
  if (!Array.isArray(raw) || raw.length > SUITED_TO_MAX || !raw.every(isAssetName) || new Set(raw).size !== raw.length) return []
  return raw
}

function partOf(files: PackageFile[], folderName: string, where: string, fallback?: { claim: string | null; version: string }): PackagePart {
  const manifest = manifestOf(files, where)
  const md = skillMdOf(files)
  if (manifest) {
    return {
      kind: manifest.kind, name: manifest.name, version: manifest.version, claim: manifest.publisher,
      title: skillTitle(md, manifest.name), description: skillDescription(md) || manifest.description,
      basedOn: manifest.basedOn, licence: manifest.licence, suitedTo: manifest.suitedTo, files, plain: false, role: false,
    }
  }
  if (!md) throw new PackageReadError(`This isn't a package: ${where || 'it '}has neither a package.json nor a ${SKILL_FILE}.`)
  if (!isAssetName(folderName)) {
    throw new PackageReadError(`A skill folder's name is the skill's name: “${folderName}” must be 1 to 64 lowercase letters, digits and single hyphens.`)
  }
  return {
    kind: 'skill', name: folderName, version: fallback?.version ?? plainVersion(skillMdVersion(md)), claim: fallback ? fallback.claim : null,
    title: skillTitle(md, folderName), description: skillDescription(md),
    basedOn: [], licence: null, suitedTo: plainSuitedTo(md), files, plain: fallback === undefined, role: false,
  }
}

/**
 * The skills a template carries, each in `skills/<folder>/` (spec part 2 *Identity*). A folder with its own
 * `package.json` is a shared skill under its own name and version, which must be the folder's; one without is the
 * template's role skill, `<template>/<folder>` at the template's version. Either is stored without a manifest, so a
 * shared skill carried inside a template is the same content as the skill installed on its own (I3).
 */
function embeddedOf(outer: PackagePart): PackagePart[] {
  const folders = new Map<string, PackageFile[]>()
  for (const file of outer.files) {
    if (!file.path.startsWith(EMBEDDED_ROOT)) continue
    const [folder, ...rest] = file.path.slice(EMBEDDED_ROOT.length).split('/')
    if (rest.length === 0) continue
    folders.set(folder, [...(folders.get(folder) ?? []), { path: rest.join('/'), content: file.content }])
  }
  const parts: PackagePart[] = []
  for (const [folder, files] of folders) {
    if (!files.some(f => f.path === SKILL_FILE)) continue
    const where = `skills/${folder}/`
    const shared = files.some(f => f.path === ASSET_MANIFEST_FILE)
    const part = partOf(files, folder, where, { claim: outer.claim, version: outer.version })
    if (part.kind !== 'skill') throw new PackageReadError(`This package can't be read: ${where} is a ${part.kind}, not a skill.`)
    const content = files.filter(f => f.path !== ASSET_MANIFEST_FILE)
    if (shared) {
      if (part.name !== folder) throw new PackageReadError(`This package can't be read: ${where} holds the skill ${part.name}; a shared skill's folder is its name.`)
      parts.push({ ...part, files: content })
      continue
    }
    const name = roleSkillName(outer.name, folder)
    if (!name) throw new PackageReadError(`This package can't be read: ${where} must be named with 1 to 64 lowercase letters, digits and single hyphens.`)
    parts.push({ ...part, name, role: true, files: content })
  }
  return parts.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

export function readParts(arrived: ArrivedPackage): PackageParts {
  const outer = partOf(arrived.files, arrived.root, '')
  return { ...outer, embedded: outer.kind === 'skill' ? [] : embeddedOf(outer) }
}
