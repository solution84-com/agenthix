import { chooseFileKind, type FileKind, type FileOpenAnswer } from '@agenthix/core'

const DRAWN_AS_TEXT: ReadonlySet<FileKind> = new Set(['image', 'pdf', 'none'])

/** Long enough that the viewer never asks again while the text is on screen; short enough for a browser timer. */
const HELD_MS = 12 * 60 * 60 * 1000

/**
 * A file's text, read from Git through hq (`getGitFile`), as the answer HQ's file viewer draws: the text goes in a
 * blob of this page's own, so the viewer reads it as it reads a file from a relay, and nothing leaves the browser.
 * `version` names the commit it was read at. The caller revokes `link` when the file is no longer shown.
 */
export function gitFileAnswer(path: string, text: string, version: string, now = Date.now()): { answer: FileOpenAnswer; link: string } {
  const name = path.split('/').pop() ?? path
  const chosen = chooseFileKind(path, true)
  // The blob has this page's origin and an agent wrote its bytes: it is only ever plain text, and a kind that would
  // hand the link to an element that loads it (an SVG image, a PDF viewer) is shown as its text instead.
  const choice = DRAWN_AS_TEXT.has(chosen.kind) ? { kind: 'text' as const, contentType: 'text/plain' } : chosen
  const bytes = new TextEncoder().encode(text)
  const link = URL.createObjectURL(new Blob([bytes], { type: 'text/plain; charset=utf-8' }))
  return {
    link,
    answer: {
      state: 'ready',
      facts: { name, size: bytes.length, version, contentType: choice.contentType, kind: choice.kind, ...(choice.language ? { language: choice.language } : {}) },
      previewLink: link,
      downloadLink: link,
      expiresAt: now + HELD_MS,
    },
  }
}
