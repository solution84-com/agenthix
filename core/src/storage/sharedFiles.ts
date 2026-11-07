/**
 * A photo or file a person adds to a conversation: kept in the conversation's own place, in one folder of its files,
 * so the agent and the work it hands off can open it. What may be kept is decided from the file's content, never
 * from its name alone, and its name is cleaned to one plain segment that agrees with that content.
 *
 * hq checks both when the file arrives, and again when it reads a picture back for a model; the site checks the name
 * again before it writes, and writes only into this folder.
 */

/** The folder of a place's files that holds what was shared in its conversations. */
export const SHARED_FOLDER = 'Shared in conversations'

/** The largest file one share takes, checked in the browser, by hq and by the site. */
export const SHARED_FILE_MAX_BYTES = 10 * 1024 * 1024

/** How many photos and files one message carries at most. */
export const SHARED_FILES_PER_MESSAGE = 6

/** The longest cleaned name, in characters: room for a long title and its extension. */
export const SHARED_NAME_MAX_CHARS = 120

/** What may be shared, said as the picker says it. */
export const SHARED_KINDS_WORDS = 'Photos (PNG, JPEG, GIF or WebP), PDFs and text files, up to 10 MB each'

export type SharedFileKind = 'image' | 'file'

/** One shared file, as a person's message keeps it: its name in the place's shared folder, what it is, its size. */
export type SharedFile = { name: string; kind: SharedFileKind; mime: string; size: number }

/** What a file's content says it is, and the extension its name is given for it. */
export type SharedContent = { kind: SharedFileKind; mime: string; ext: string }

/** The images a model may be given, by their content's type. */
export const SHARED_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const

/** Text kept under its own extension; any other text is kept as `.txt`. Markup a browser would run is not one. */
const TEXT_EXTS: Record<string, string> = {
  txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown', csv: 'text/csv', tsv: 'text/tab-separated-values',
  json: 'application/json', log: 'text/plain', yaml: 'text/plain', yml: 'text/plain', toml: 'text/plain',
  ini: 'text/plain', sql: 'text/plain', py: 'text/plain', ts: 'text/plain', js: 'text/plain', sh: 'text/plain',
  css: 'text/plain', diff: 'text/plain', patch: 'text/plain',
}

/** The extensions the file picker offers, beside the types it names. */
export const SHARED_PICKER_ACCEPT = [...SHARED_IMAGE_MIMES, 'application/pdf', 'text/plain', ...Object.keys(TEXT_EXTS).map(e => `.${e}`)].join(',')

const startsWith = (bytes: Uint8Array, at: number, sig: readonly number[]) =>
  bytes.length >= at + sig.length && sig.every((b, i) => bytes[at + i] === b)
const ascii = (s: string) => [...s].map(c => c.charCodeAt(0))

/** Whether the bytes are UTF-8 with no NUL and none of the control characters text never holds. */
function isText(bytes: Uint8Array): boolean {
  let i = 0
  while (i < bytes.length) {
    const b = bytes[i]
    if (b < 0x80) {
      if (b === 0 || (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d && b !== 0x0c) || b === 0x7f) return false
      i += 1
      continue
    }
    const extra = b >= 0xc2 && b <= 0xdf ? 1 : b >= 0xe0 && b <= 0xef ? 2 : b >= 0xf0 && b <= 0xf4 ? 3 : -1
    if (extra < 0) return false
    for (let k = 1; k <= extra; k++) if (i + k >= bytes.length || (bytes[i + k] & 0xc0) !== 0x80) return false
    // Overlong forms, surrogates and code points past U+10FFFF.
    if (b === 0xe0 && bytes[i + 1] < 0xa0) return false
    if (b === 0xed && bytes[i + 1] > 0x9f) return false
    if (b === 0xf0 && bytes[i + 1] < 0x90) return false
    if (b === 0xf4 && bytes[i + 1] > 0x8f) return false
    i += extra + 1
  }
  return true
}

function extOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/** What the content is, read from its first bytes (and, for text, all of it); null for anything that may not be shared. */
export function sniffSharedContent(bytes: Uint8Array, name: string): SharedContent | null {
  if (bytes.length === 0) return null
  if (startsWith(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: 'image', mime: 'image/png', ext: 'png' }
  if (startsWith(bytes, 0, [0xff, 0xd8, 0xff])) return { kind: 'image', mime: 'image/jpeg', ext: extOf(name) === 'jpeg' ? 'jpeg' : 'jpg' }
  if (startsWith(bytes, 0, ascii('GIF87a')) || startsWith(bytes, 0, ascii('GIF89a'))) return { kind: 'image', mime: 'image/gif', ext: 'gif' }
  if (startsWith(bytes, 0, ascii('RIFF')) && startsWith(bytes, 8, ascii('WEBP'))) return { kind: 'image', mime: 'image/webp', ext: 'webp' }
  if (startsWith(bytes, 0, ascii('%PDF-'))) return { kind: 'file', mime: 'application/pdf', ext: 'pdf' }
  if (!isText(bytes)) return null
  const ext = extOf(name)
  return ext in TEXT_EXTS ? { kind: 'file', mime: TEXT_EXTS[ext], ext } : { kind: 'file', mime: 'text/plain', ext: 'txt' }
}

// Characters no file name keeps: separators, the ones some systems refuse, and control characters.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHAR = /[\u0000-\u001f\u007f<>:"/\\|?*]/
const UNSAFE = new RegExp(UNSAFE_CHAR.source, 'g')

/**
 * The name a shared file is kept under: the last segment of what the person's device called it, its unsafe
 * characters made spaces, no leading dot, at most `SHARED_NAME_MAX_CHARS`, and ending in the extension its content
 * gives it (`photo.png` that is a JPEG is kept as `photo.jpg`; text not of a kept kind as `notes.txt`).
 */
export function cleanSharedName(raw: string, content: Pick<SharedContent, 'ext'>): string {
  const last = String(raw ?? '').split(/[/\\]/).pop() ?? ''
  const plain = last.normalize('NFC').replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim().replace(/^[.\s]+/, '')
  const dot = plain.lastIndexOf('.')
  const had = dot > 0 ? plain.slice(dot + 1).toLowerCase() : ''
  let base = dot > 0 && had === content.ext ? plain.slice(0, dot) : plain
  base = base.replace(/[.\s]+$/, '')
  const room = SHARED_NAME_MAX_CHARS - content.ext.length - 1
  base = [...base].slice(0, room).join('').replace(/[.\s]+$/, '')
  return `${base || 'file'}.${content.ext}`
}

/**
 * Why a name may not be written into the shared folder as it stands; null when it may. A name is one plain segment,
 * already as `cleanSharedName` leaves one, so the site writes exactly what hq named.
 */
export function sharedNameProblem(name: unknown): string | null {
  if (typeof name !== 'string' || name.length === 0) return 'a name is required'
  if ([...name].length > SHARED_NAME_MAX_CHARS) return 'the name is too long'
  if (UNSAFE_CHAR.test(name)) return 'the name holds a character a file name may not'
  if (name.startsWith('.') || name.endsWith('.') || name !== name.trim() || name.normalize('NFC') !== name) return 'the name is not a plain one'
  if (!/\.[a-z0-9]+$/.test(name)) return 'the name has no extension'
  return null
}

/** The name for the `n`th file of one name (from 2): `shot (2).png`. */
export function numberedSharedName(name: string, n: number): string {
  const dot = name.lastIndexOf('.')
  return `${name.slice(0, dot)} (${n})${name.slice(dot)}`
}

/** A shared file as the agent and the message's chips name it: `files/Shared in conversations/shot.png`. */
export function sharedReference(name: string): string {
  return `files/${SHARED_FOLDER}/${name}`
}

/** A stored message's shared files, each checked; anything that is not one is left out. */
export function sharedFilesOf(value: unknown): SharedFile[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((f: unknown): SharedFile[] => {
    const v = f as Partial<SharedFile> | null
    if (!v || sharedNameProblem(v.name) !== null) return []
    if (v.kind !== 'image' && v.kind !== 'file') return []
    if (typeof v.mime !== 'string' || typeof v.size !== 'number' || !Number.isFinite(v.size) || v.size < 0) return []
    return [{ name: v.name as string, kind: v.kind, mime: v.mime, size: v.size }]
  }).slice(0, SHARED_FILES_PER_MESSAGE)
}
