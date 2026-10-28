/**
 * The plain checks every `propose_skill` call passes before anything is stored (spec part 5 *Proposing*; security
 * review H5), as `propose_workflow`'s are: the files as one tool call can carry them, the Agent Skills rules (R8) through
 * the one validation every save passes, the header keys a run ignores flagged, and every file `SKILL.md` names present.
 * Pure: what it refuses it says in words the agent can act on.
 */
import type { PackageFile } from '../../library/packages/packageZip'
import { SKILL_FILE, skillDescription, skillMdOf } from '../skillFile'
import { validateSkill } from '../validation'
import { AIMS, PROPOSAL_MAX_BYTES, PROPOSAL_MAX_FILES, type AimArg } from './types'

const NOTHING = 'Nothing was changed.'
const PATH_MAX = 200

export class ProposalRefused extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message)
  }
}

export type CheckedProposal = {
  name: string
  description: string
  why: string
  aim: AimArg
  edits: string | null
  files: PackageFile[]
  warnings: string[]
}

const text = (v: unknown) => (typeof v === 'string' ? v : '')

/** The files as stored. A SKILL.md without front matter is given one from the name and description. */
function filesOf(raw: unknown, name: string, description: string): PackageFile[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ProposalRefused(`Send files as a map of each file's path to its text, with ${SKILL_FILE} among them. ${NOTHING}`)
  const entries = Object.entries(raw as Record<string, unknown>)
  if (entries.length === 0) throw new ProposalRefused(`Send the skill's files, ${SKILL_FILE} among them. ${NOTHING}`)
  if (entries.length > PROPOSAL_MAX_FILES) throw new ProposalRefused(`A proposed skill holds at most ${PROPOSAL_MAX_FILES} files. ${NOTHING}`)
  let total = 0
  const files = entries.map(([path, content]) => {
    if (typeof content !== 'string') throw new ProposalRefused(`${path.slice(0, PATH_MAX)} needs its content as text. ${NOTHING}`)
    if (path.length > PATH_MAX) throw new ProposalRefused(`A file's path is at most ${PATH_MAX} characters. ${NOTHING}`)
    if (path === 'package.json') throw new ProposalRefused(`package.json is the package's manifest, which HQ writes; send only the skill's files. ${NOTHING}`)
    const body = path === SKILL_FILE && !content.startsWith('---') ? withHeader(name, description, content) : content
    const bytes = Buffer.from(body, 'utf-8')
    total += bytes.length
    return { path, content: bytes }
  })
  if (total > PROPOSAL_MAX_BYTES) throw new ProposalRefused(`The files are ${total} bytes; a proposed skill is at most ${PROPOSAL_MAX_BYTES}. ${NOTHING}`)
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

function withHeader(name: string, description: string, body: string): string {
  return `---\nname: ${name}\ndescription: ${JSON.stringify(description.trim())}\n---\n\n${body.replace(/^\n+/, '')}`
}

/** Relative paths `SKILL.md`'s body points at: its links, and paths under `scripts/`, `references/` and `assets/`. */
export function namedPaths(body: string): string[] {
  const found = new Set<string>()
  for (const m of body.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
    const target = m[1]!.split('#')[0]!.split('?')[0]!
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/')) continue
    found.add(target.replace(/^\.\//, ''))
  }
  for (const m of body.matchAll(/(?:^|[\s`'"(])((?:scripts|references|assets)\/[A-Za-z0-9._\-/]*[A-Za-z0-9_\-/])/g)) found.add(m[1]!)
  return [...found]
}

/** The named paths no file answers: a folder is answered by any file under it. */
export function missingNamed(body: string, paths: string[]): string[] {
  return namedPaths(body).filter(p => p.endsWith('/') ? !paths.some(f => f.startsWith(p)) : !paths.includes(p))
}

export function checkProposal(args: Record<string, unknown>): CheckedProposal {
  const name = text(args.name).trim()
  const why = text(args.why).trim().slice(0, 2000)
  const aim = text(args.aim) as AimArg
  if (!(AIMS as readonly string[]).includes(aim)) throw new ProposalRefused(`Say who it is for with aim: organisation, project or person. ${NOTHING}`)
  if (!why) throw new ProposalRefused(`Say why you propose it, in a sentence the reviewer reads. ${NOTHING}`)
  const edits = text(args.edits).trim() || null
  const files = filesOf(args.files, name, text(args.description))

  const { errors, warnings } = validateSkill(name, files)
  if (errors.length) throw new ProposalRefused(`${errors.join(' ')} ${NOTHING}`)
  const md = skillMdOf(files)!
  const missing = missingNamed(md.body, files.map(f => f.path))
  if (missing.length) {
    throw new ProposalRefused(`${SKILL_FILE} names files that aren't sent: ${missing.slice(0, 5).join(', ')}. Send them too, or take them out of ${SKILL_FILE}. ${NOTHING}`)
  }
  return { name, description: skillDescription(md), why, aim, edits, files, warnings }
}
