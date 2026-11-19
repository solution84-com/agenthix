import { useReveal } from './useReveal'

/** Plain text whose characters fade in as the reveal passes them; settled text is drawn as it is. */
export function RevealText({ text, arriving, settled }: { text: string; arriving: boolean; /** Already on screen elsewhere: not revealed again. */ settled?: number }) {
  const { ref, marks } = useReveal({ text, target: null, arriving, live: false, settled })
  if (!marks) return <span ref={ref}>{text}</span>
  const out: React.ReactNode[] = [text.slice(0, marks.from)]
  let plain = ''
  for (let i = marks.from; i < text.length; i++) {
    const ch = text[i]!
    if (/\s/.test(ch)) { plain += ch; continue }
    if (plain) { out.push(plain); plain = '' }
    out.push(<span key={i} data-c={i} style={{ opacity: marks.opacity(i) }}>{ch}</span>)
  }
  if (plain) out.push(plain)
  return <span ref={ref}>{out}</span>
}
