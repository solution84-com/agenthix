/**
 * Whether a file's first bytes look like text: what the site answers when hq asks about a file, so that
 * `chooseFileKind` never sends a binary file to a renderer that draws text.
 */

/** How many of a file's first bytes the site looks at. */
export const TEXT_SNIFF_BYTES = 8192

const ALLOWED_CONTROLS = new Set([0x09, 0x0a, 0x0c, 0x0d, 0x1b]) // tab, newline, form feed, return, escape (colours in logs)

/**
 * Valid UTF-8 with no NUL byte, and at most one other control character in 32. A multi-byte character cut off by the
 * end of the sample is allowed, since the sample is only the first bytes. Text in UTF-16 is not text here.
 */
export function looksLikeText(sample: Uint8Array): boolean {
  let controls = 0
  let i = 0
  while (i < sample.length) {
    const b = sample[i]
    if (b < 0x80) {
      if (b === 0) return false
      if ((b < 0x20 || b === 0x7f) && !ALLOWED_CONTROLS.has(b)) controls++
      i++
      continue
    }
    const need = b >= 0xc2 && b <= 0xdf ? 1 : b >= 0xe0 && b <= 0xef ? 2 : b >= 0xf0 && b <= 0xf4 ? 3 : -1
    if (need < 0) return false
    for (let k = 1; k <= need; k++) {
      if (i + k >= sample.length) return true
      const c = sample[i + k]
      if ((c & 0xc0) !== 0x80) return false
      if (k === 1 && ((b === 0xe0 && c < 0xa0) || (b === 0xed && c > 0x9f) || (b === 0xf0 && c < 0x90) || (b === 0xf4 && c > 0x8f))) return false
    }
    i += need + 1
  }
  return controls * 32 <= sample.length
}
