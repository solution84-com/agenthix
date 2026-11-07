import { chooseFileKind } from '@agenthix/core'
import { textOf } from '../../editor/editorFiles'

/** "4,970 bytes · 98 lines": how big an open file is (lines only for text). */
export function fileSize(bytes: Uint8Array): string {
  const text = textOf(bytes)
  const parts = [`${bytes.length.toLocaleString('en-GB')} bytes`]
  if (text !== null) {
    const lines = text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
    parts.push(`${lines.toLocaleString('en-GB')} ${lines === 1 ? 'line' : 'lines'}`)
  }
  return parts.join(' · ')
}

/** "text/markdown · 4,970 bytes · 98 lines": what an open file is, said once, as its heading's tooltip. */
export function fileDetails(path: string, bytes: Uint8Array): string {
  return [chooseFileKind(path, textOf(bytes) !== null).contentType, fileSize(bytes)].join(' · ')
}
