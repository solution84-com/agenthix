/**
 * Drafts (spec part 2 *Editing: draft, then publish*, D24, D25; security review H5): the rules a save and a publish
 * follow, apart from the records. One draft per asset, shared; each save is a revision; a publish names the revision
 * its publisher saw and is refused when a newer one exists. The editor edits the asset's files, never its manifest.
 * Pure.
 */
import { ASSET_MANIFEST_FILE } from '@agenthix/core'
import { MAX_PACKAGE_ENTRIES as MAX_PACKAGE_FILES } from '../install/archive'
import type { PackageFile } from '../../library/packages/packageZip'
import { SKILL_FILE } from '../skillFile'
import { LifecycleError } from './errors'
import { BUMPS, type Bump } from './versions'

const NOTHING = 'Nothing was changed.'
const NOTE_MAX = 1000

export class DraftError extends LifecycleError {}

export type DraftFileInput = { path: string; text?: string; base64?: string }

/** The files a save sends, as stored. Paths and sizes are checked by the validation every save passes. */
export function draftFiles(input: unknown): PackageFile[] {
  if (!Array.isArray(input) || input.length === 0) throw new DraftError(`Send the skill's files. ${NOTHING}`)
  if (input.length > MAX_PACKAGE_FILES) throw new DraftError(`A skill holds at most ${MAX_PACKAGE_FILES} files. ${NOTHING}`)
  return input.map((raw: unknown) => {
    const f = (raw ?? {}) as Record<string, unknown>
    if (typeof f.path !== 'string' || f.path === '') throw new DraftError(`Every file needs a path. ${NOTHING}`)
    if (f.path === ASSET_MANIFEST_FILE) throw new DraftError(`${ASSET_MANIFEST_FILE} is the package's manifest, which hq writes; the editor changes the skill's files only. ${NOTHING}`)
    const hasText = typeof f.text === 'string'
    const hasBase64 = typeof f.base64 === 'string'
    if (hasText === hasBase64) throw new DraftError(`${f.path.slice(0, 200)} needs its content, as text or base64. ${NOTHING}`)
    return { path: f.path, content: hasText ? Buffer.from(f.text as string, 'utf-8') : Buffer.from(f.base64 as string, 'base64') }
  })
}

/**
 * Why a save can't go on. `seen` is the revision the editor loaded: null when it loaded the published version (no
 * draft), undefined when the saver names none (an agent's proposal adds a revision on top).
 */
export function saveRefusal(newest: number | null, seen: number | null | undefined): string | null {
  if (seen === undefined || seen === newest) return null
  if (newest === null) return `The draft you were editing is no longer there: it was published or discarded. Open the skill again. ${NOTHING}`
  return `Someone saved this draft since you opened it (it is at revision ${newest}). Open it again to see their change. ${NOTHING}`
}

/** H5: only the revision the publisher saw is published. */
export function publishRefusal(draft: { revision: number } | null, seen: number): string | null {
  if (!draft) return `There is no draft to publish. ${NOTHING}`
  if (!Number.isSafeInteger(seen)) return `Say which revision of the draft you looked at. ${NOTHING}`
  if (draft.revision !== seen) {
    return `The draft changed since you looked at it: it is at revision ${draft.revision}, and you saw ${seen}. Look at the changes again before publishing. ${NOTHING}`
  }
  return null
}

export function publishNote(note: unknown): string {
  const text = typeof note === 'string' ? note.trim() : ''
  if (!text) throw new DraftError(`Write a note saying what changed; it goes in the history. ${NOTHING}`)
  return text.slice(0, NOTE_MAX)
}

export function bumpOf(raw: unknown): Bump {
  if (raw === undefined || raw === null) return 'minor'
  if (!(BUMPS as readonly unknown[]).includes(raw)) throw new DraftError(`Choose patch, minor or major. ${NOTHING}`)
  return raw as Bump
}

export type StarterShape = 'plain' | 'scripts'

const SCRIPTS_README = '# Scripts\n\nScripts this skill runs. Say in SKILL.md when to run each one.\n'
const REFERENCES_README = '# References\n\nLonger material the skill points to. Say in SKILL.md when to read each file.\n'

/** *New skill*: a SKILL.md with its name and description, and for the second shape `scripts/` and `references/`. */
export function starterFiles(name: string, description: string, shape: StarterShape): PackageFile[] {
  const md = `---\nname: ${name}\ndescription: ${JSON.stringify(description.trim())}\n---\n\n# ${name}\n\nSay step by step what the agent does.\n`
  const files: PackageFile[] = [{ path: SKILL_FILE, content: Buffer.from(md, 'utf-8') }]
  if (shape === 'scripts') {
    files.push({ path: 'references/README.md', content: Buffer.from(REFERENCES_README, 'utf-8') })
    files.push({ path: 'scripts/README.md', content: Buffer.from(SCRIPTS_README, 'utf-8') })
  }
  return files
}
