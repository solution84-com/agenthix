// Version tags as images and actions name them (24.14.1-alpine3.23, v3.1.3, 3.23, 2-alpine), and the rule every update
// follows: the newest tag of the same shape (prefix, count of numbers, suffix) within the same major, never a lower one.

/** A tag's prefix (v or nothing), its numbers and its suffix, or null when it starts with no number. */
export function parseVersionTag(tag) {
  const m = /^(v?)(\d+(?:\.\d+)*)(.*)$/.exec(tag)
  if (!m) return null
  return { prefix: m[1], numbers: m[2].split('.').map(Number), suffix: m[3] }
}

export function compareNumbers(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

const sameShape = (a, b) => a.prefix === b.prefix && a.suffix === b.suffix && a.numbers.length === b.numbers.length

/** The newest of `tags` with the shape and major of `current`; `current` itself when none is newer. */
export function newestWithin(current, tags) {
  const now = parseVersionTag(current)
  if (!now) return current
  let best = now
  let bestTag = current
  for (const tag of tags) {
    const v = parseVersionTag(tag)
    if (!v || !sameShape(v, now) || v.numbers[0] !== now.numbers[0]) continue
    if (compareNumbers(v.numbers, best.numbers) > 0) { best = v; bestTag = tag }
  }
  return bestTag
}
