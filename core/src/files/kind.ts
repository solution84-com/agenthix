/**
 * What kind of file a file is, so hq, the site and the page agree which renderer draws it (adr-0155). The name gives
 * a content type; the site's look at the first bytes says whether it is text. Nothing else decides.
 */

export const FILE_KINDS = ['markdown', 'text', 'code', 'json', 'csv', 'image', 'pdf', 'none'] as const
export type FileKind = (typeof FILE_KINDS)[number]

export type FileKindChoice = {
  kind: FileKind
  /** The guess from the name alone, with no parameters; `application/octet-stream` when the name says nothing. */
  contentType: string
  /** For `code`: the language to highlight it as. */
  language?: string
}

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
  svg: 'image/svg+xml', ico: 'image/x-icon', bmp: 'image/bmp',
}

/** Extensions drawn as code, with the language each is highlighted as. */
const CODE_LANGUAGES: Record<string, string> = {
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx', js: 'javascript', mjs: 'javascript',
  cjs: 'javascript', jsx: 'jsx', py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin',
  swift: 'swift', c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php', sh: 'bash',
  bash: 'bash', zsh: 'bash', ps1: 'powershell', yml: 'yaml', yaml: 'yaml', toml: 'toml', ini: 'ini', css: 'css',
  scss: 'scss', html: 'html', htm: 'html', xml: 'xml', sql: 'sql', prisma: 'prisma', graphql: 'graphql',
  dart: 'dart', lua: 'lua', r: 'r', env: 'bash', dockerfile: 'dockerfile', makefile: 'makefile',
}

/** Whole names (lower-cased) that are code without an extension. */
const CODE_NAMES: Record<string, string> = { dockerfile: 'dockerfile', makefile: 'makefile', '.env': 'bash' }

const TEXT_TYPES: Record<string, string> = {
  md: 'text/markdown', markdown: 'text/markdown', json: 'application/json', csv: 'text/csv', txt: 'text/plain',
  log: 'text/plain', html: 'text/html', htm: 'text/html', css: 'text/css', xml: 'application/xml',
  yml: 'application/yaml', yaml: 'application/yaml', js: 'text/javascript', mjs: 'text/javascript',
}

function split(nameOrPath: string): { base: string; ext: string } {
  const base = (nameOrPath.split(/[\\/]/).pop() ?? '').toLowerCase()
  const dot = base.lastIndexOf('.')
  return { base, ext: dot > 0 ? base.slice(dot + 1) : '' }
}

/** The content type a file's name suggests. */
export function contentTypeForName(nameOrPath: string): string {
  const { ext } = split(nameOrPath)
  if (ext === 'pdf') return 'application/pdf'
  return IMAGE_TYPES[ext] ?? TEXT_TYPES[ext] ?? (CODE_LANGUAGES[ext] ? 'text/plain' : 'application/octet-stream')
}

/**
 * The one choice of kind. Images and PDFs by name alone, since they are binary by nature (an SVG is drawn as an
 * image, never as markup). Every other kind needs the first bytes to look like text: a binary file named `.md` is
 * `none`, as is any binary the name says nothing about. A text file with a name nothing else claims is `text`.
 */
export function chooseFileKind(nameOrPath: string, looksLikeText: boolean): FileKindChoice {
  const { base, ext } = split(nameOrPath)
  const contentType = contentTypeForName(nameOrPath)
  if (IMAGE_TYPES[ext]) return { kind: 'image', contentType }
  if (ext === 'pdf') return { kind: 'pdf', contentType }
  if (!looksLikeText) return { kind: 'none', contentType }
  if (ext === 'md' || ext === 'markdown') return { kind: 'markdown', contentType }
  if (ext === 'json') return { kind: 'json', contentType }
  if (ext === 'csv') return { kind: 'csv', contentType }
  const language = CODE_NAMES[base] ?? CODE_LANGUAGES[ext]
  if (language) return { kind: 'code', contentType: contentType === 'application/octet-stream' ? 'text/plain' : contentType, language }
  return { kind: 'text', contentType: contentType === 'application/octet-stream' ? 'text/plain' : contentType }
}
