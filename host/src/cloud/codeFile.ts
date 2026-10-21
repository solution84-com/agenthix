/**
 * The one-time enrolment code (pre-release spec B2), read from the file `CLOUD_ENROLMENT_CODE_FILE` names.
 * The file must be a plain file owned by root and readable by it alone (`0600`), or it is not read at all. The code is
 * valid once and for an hour at most from when the file was written; any join that fails spends it, and a spent code's
 * file is deleted. Its lookup is kept as spent too, so a file that could not be deleted is never used twice. The code
 * itself is never logged, kept, or put in a message.
 */
import fs from 'node:fs'
import { JOIN_CODE_TTL_MS, normalizeJoinCode } from '@agenthix/core'
import { cloudJoinLookup } from '@agenthix/core/host-crypto'
import type { StateFolder } from '../state/folder'

const SPENT = ['link', 'cloud-spent.json']
const KEEP_SPENT = 20

export type EnrolmentCode =
  | { ok: true; code: string; lookup: string; expiresAt: number }
  /** `spend`: the file is to be deleted; otherwise it stays for the machine admin to put right. */
  | { ok: false; problem: string; spend: boolean; lookup: string | null }

function spentLookups(state: StateFolder): string[] {
  try {
    const v = state.readJson(...SPENT)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** `ownerUid` is root's but for tests, which do not run as root. */
export async function readEnrolmentCode(state: StateFolder, file: string, now: number, ownerUid = 0): Promise<EnrolmentCode> {
  let fd: number
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  } catch (err) {
    const missing = (err as NodeJS.ErrnoException).code === 'ENOENT'
    return { ok: false, problem: missing ? 'there is no enrolment code file' : 'the enrolment code file cannot be opened (a symbolic link is not followed)', spend: false, lookup: null }
  }
  try {
    const st = fs.fstatSync(fd)
    if (!st.isFile()) return { ok: false, problem: 'the enrolment code file is not a plain file', spend: false, lookup: null }
    if (st.uid !== ownerUid || (st.mode & 0o777) !== 0o600) {
      return { ok: false, problem: 'the enrolment code file must be owned by root and readable by it alone (mode 0600); it was not read', spend: false, lookup: null }
    }
    if (st.size > 256) return { ok: false, problem: 'the enrolment code file does not hold a code', spend: true, lookup: null }
    const code = normalizeJoinCode(fs.readFileSync(fd, 'utf8'))
    if (!code) return { ok: false, problem: 'the enrolment code file does not hold a code', spend: true, lookup: null }
    const lookup = await cloudJoinLookup(code)
    if (spentLookups(state).includes(lookup)) return { ok: false, problem: 'the enrolment code was already used', spend: true, lookup }
    const expiresAt = st.mtimeMs + JOIN_CODE_TTL_MS
    if (expiresAt <= now) return { ok: false, problem: 'the enrolment code is more than an hour old', spend: true, lookup }
    return { ok: true, code, lookup, expiresAt }
  } finally {
    fs.closeSync(fd)
  }
}

/** The code is used up: its lookup is kept as spent, and its file deleted. */
export function spendEnrolmentCode(state: StateFolder, file: string, lookup: string | null, log: (line: string) => void): void {
  if (lookup) state.writeJson(SPENT, [...spentLookups(state).filter(l => l !== lookup), lookup].slice(-KEEP_SPENT))
  try {
    fs.rmSync(file, { force: true })
  } catch (err) {
    log(`The spent enrolment code file could not be deleted (${(err as NodeJS.ErrnoException).code ?? 'error'}); it will not be used again. Delete it by hand.`)
  }
}
