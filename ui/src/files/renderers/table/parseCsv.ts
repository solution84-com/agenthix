export interface ParsedCsv {
  /** The first `maxRows` rows. */
  rows: string[][]
  /** Every row the text holds, counted past `maxRows`. */
  total: number
}

/**
 * RFC 4180: fields in double quotes may hold commas, line breaks and `""` for a quote; a line ends at CRLF, and a lone
 * LF or CR is read as one too. Forgiving where files are not exact: an unterminated quote runs to the end, a quote in
 * the middle of an unquoted field stays as it is, rows may differ in length.
 */
export function parseCsv(text: string, maxRows = Infinity): ParsedCsv {
  const rows: string[][] = []
  let total = 0
  let row: string[] = []
  let field = ''
  let quoted = false
  let touched = false // anything since the last line ended, so the text's final newline adds no empty row

  const endRow = () => {
    row.push(field)
    if (total < maxRows) rows.push(row)
    total++
    row = []
    field = ''
    touched = false
  }

  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0
  for (; i < text.length; i++) {
    const c = text[i]!
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += c
      continue
    }
    touched = true
    if (c === '"' && field === '') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') endRow()
    else if (c === '\r') { if (text[i + 1] === '\n') i++; endRow() }
    else field += c
  }
  if (touched || quoted) endRow()
  return { rows, total }
}
