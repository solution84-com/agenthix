/**
 * What one file IS, for the read-only preview viewer: markdown, code, an
 * image, something binary, or something too large to show. Kind-discriminated
 * and size-capped.
 *
 * Judgement only. The bytes arrive from the Execution Site that holds them
 * (`./locationFileStore.ts`), and so does containment — checked where the disk
 * is, by the side that has one. This module reaches no filesystem at all,
 * which is why it is synchronous.
 */
import path from 'node:path'

/**
 * The preview cap. Exported because the caller applies it FROM THE STAT,
 * before asking for the bytes: streaming a megabyte in order to decide not to
 * show it is work nobody needs. It is still applied here as well, against what
 * actually arrived, so the cap cannot be skipped by a caller that forgot it.
 */
export const FILE_CONTENT_MAX_BYTES = 1_000_000

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.bmp': 'image/bmp',
}
const LANG: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.jsx': 'jsx', '.json': 'json',
  '.py': 'python', '.rb': 'ruby', '.go': 'go', '.rs': 'rust', '.java': 'java', '.c': 'c',
  '.cpp': 'cpp', '.cs': 'csharp', '.sh': 'bash', '.yml': 'yaml', '.yaml': 'yaml', '.toml': 'toml',
  '.css': 'css', '.html': 'html', '.sql': 'sql', '.prisma': 'prisma', '.wasp': 'text', '.env': 'bash',
}

export type FileContent =
  | { kind: 'markdown'; name: string; text: string }
  | { kind: 'code'; name: string; text: string; lang: string }
  | { kind: 'image'; name: string; dataUrl: string }
  | { kind: 'binary'; name: string }
  | { kind: 'too-large'; name: string }

export function classifyFileContent(name: string, bytes: Buffer): FileContent {
  const ext = path.extname(name).toLowerCase()
  if (bytes.byteLength > FILE_CONTENT_MAX_BYTES) return { kind: 'too-large', name }

  if (IMAGE_MIME[ext]) {
    return { kind: 'image', name, dataUrl: `data:${IMAGE_MIME[ext]};base64,${bytes.toString('base64')}` }
  }

  if (bytes.includes(0)) return { kind: 'binary', name } // NUL → not text
  const text = bytes.toString('utf8')
  if (ext === '.md' || ext === '.markdown') return { kind: 'markdown', name, text }
  return { kind: 'code', name, text, lang: LANG[ext] ?? 'text' }
}
