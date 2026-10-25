/**
 * Reading the reviewer's answer, strictly: one JSON object, `level` one of three words and at most five points,
 * each a file of the version and a line. Anything else is "the reviewer's answer couldn't be read", at
 * *look closely*: a reviewer steered into answering oddly gets no say over what the person reads.
 */
import { REVIEW_POINTS_MAX, UNREADABLE_NOTE, type ReviewLevelWord, type ReviewPoint } from './types'

export type ReviewAnswer =
  | { readable: true; level: ReviewLevelWord; points: ReviewPoint[] }
  | { readable: false; level: 'look closely'; note: string }

const LEVELS: readonly string[] = ['low', 'look closely', 'high']
const POINT_TEXT_MAX = 500
const unreadable: ReviewAnswer = { readable: false, level: 'look closely', note: UNREADABLE_NOTE }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const exactKeys = (r: Record<string, unknown>, keys: string[]) =>
  Object.keys(r).length === keys.length && keys.every((k) => Object.hasOwn(r, k))

/** `files`: the version's file paths; `workflow.yaml` names the definition. */
export function readReviewAnswer(text: string, files: readonly string[]): ReviewAnswer {
  let body = text.trim()
  const fenced = /^```(?:json)?\n([\s\S]*)\n```$/.exec(body)
  if (fenced) body = fenced[1].trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return unreadable
  }
  if (!isRecord(parsed) || !exactKeys(parsed, ['level', 'points'])) return unreadable
  const { level, points } = parsed
  if (typeof level !== 'string' || !LEVELS.includes(level)) return unreadable
  if (!Array.isArray(points) || points.length > REVIEW_POINTS_MAX) return unreadable
  const known = new Set([...files, 'workflow.yaml'])
  const out: ReviewPoint[] = []
  for (const p of points) {
    if (!isRecord(p) || !exactKeys(p, ['file', 'line', 'text'])) return unreadable
    if (typeof p.file !== 'string' || !known.has(p.file)) return unreadable
    if (typeof p.line !== 'number' || !Number.isInteger(p.line) || p.line < 1) return unreadable
    if (typeof p.text !== 'string' || !p.text.trim() || p.text.length > POINT_TEXT_MAX) return unreadable
    out.push({ file: p.file, line: p.line, text: p.text.trim() })
  }
  return { readable: true, level: level as ReviewLevelWord, points: out }
}
