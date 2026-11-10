/** The longest run drawn as one piece: a line longer than this is cut into pieces, so no run is megabytes wide. */
export const LINE_CHUNK = 1000

/** Where a long line may be cut, nearest the end of the window first: after a comma, a closing brace or bracket, or a space. */
const BREAK = /[,}\] ]/g

/** The text as lines, any line longer than `max` cut into pieces (at a comma, bracket or space where it can be). */
export function splitLines(text: string, max = LINE_CHUNK): string[] {
  if (text === '') return []
  const lines = text.split('\n')
  if (text.endsWith('\n')) lines.pop()
  const out: string[] = []
  for (const line of lines) {
    let rest = line
    while (rest.length > max) {
      const window = rest.slice(0, max)
      BREAK.lastIndex = 0
      let cut = 0
      for (let m = BREAK.exec(window); m; m = BREAK.exec(window)) cut = m.index + 1
      if (cut < max / 2) cut = max
      out.push(rest.slice(0, cut))
      rest = rest.slice(cut)
    }
    out.push(rest)
  }
  return out
}

/** Text as text, one block per line, wrapped; never as HTML, and never one run too long for the browser to wrap. */
export function TextLines({ text }: { text: string }) {
  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-small text-text-primary">
      {splitLines(text).map((line, i) => <span key={i} className="block min-h-[1lh]">{line}</span>)}
    </pre>
  )
}
