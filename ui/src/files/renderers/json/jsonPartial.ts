/**
 * The whole records at the start of a JSON text that was cut: the text up to the last comma between records, closed
 * with the brackets that were open there. "Records" are the entries of the shallowest array or object with at least
 * three of them, so `[{…},{…}…]` and `{"rows":[{…}…]}` both give their rows. Strings are skipped, so a comma in one
 * is no boundary. Null when there is no boundary to cut at.
 */
export function wholeRecords(text: string): { text: string; records: number } | null {
  const stack: string[] = []
  const counts: number[] = []
  const lasts: ({ index: number; closers: string } | undefined)[] = []
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') stack.push('}')
    else if (c === '[') stack.push(']')
    else if (c === '}' || c === ']') stack.pop()
    else if (c === ',' && stack.length > 0) {
      const d = stack.length
      counts[d] = (counts[d] ?? 0) + 1
      lasts[d] = { index: i, closers: [...stack].reverse().join('') }
    }
  }
  let depth = counts.findIndex((n, d) => d > 0 && (n ?? 0) >= 2)
  if (depth < 1) depth = counts.length - 1
  const last = lasts[depth]
  if (!last) return null
  return { text: text.slice(0, last.index) + last.closers, records: counts[depth]! }
}
