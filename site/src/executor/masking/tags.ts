/**
 * The forms' tags (core's `protocol/workflowRuns.ts`, *Masking material*), arranged so a position costs one rolling
 * hash for each distinct tag span rather than an HMAC for each distinct length. A tag only says where an HMAC is worth
 * computing; the HMAC still decides every find.
 */
import { WORKFLOW_MASK_TAG_BITS, WORKFLOW_MASK_TAG_SPAN_MAX, type WorkflowMaskForm } from '@agenthix/core'

export const TAG_SHIFT = 32 - WORKFLOW_MASK_TAG_BITS
const TAG_COUNT = 1 << WORKFLOW_MASK_TAG_BITS

/** The forms whose tags cover the same number of bytes: for each tag, the lengths of the forms that carry it. */
export type TagGroup = { span: number; power: number; lengths: (number[] | undefined)[] }

/** Whether a form carries a tag; one that carries half a tag, or a tag out of range, is refused. */
export function hasTag(f: WorkflowMaskForm): boolean {
  if (f.tag === undefined && f.tagSpan === undefined) return false
  const { tag, tagSpan } = f
  if (!Number.isInteger(tag) || tag! < 0 || tag! >= TAG_COUNT
    || !Number.isInteger(tagSpan) || tagSpan! < 1 || tagSpan! > WORKFLOW_MASK_TAG_SPAN_MAX) {
    throw new Error('The masking material has a form whose tag is not a tag and a span.')
  }
  return true
}

export function validTagBase(base: unknown): base is number {
  return Number.isInteger(base) && (base as number) >= 1 && (base as number) < 2 ** 32
}

export class TagGroups {
  readonly groups: TagGroup[] = []
  /** Every length of a form with a tag, ascending. */
  readonly lengths: number[] = []

  constructor(readonly base: number) {}

  add(tag: number, span: number, length: number): void {
    let g = this.groups.find(x => x.span === span)
    if (!g) {
      let power = 1
      for (let i = 0; i < span; i++) power = Math.imul(power, this.base)
      g = { span, power, lengths: new Array<number[] | undefined>(TAG_COUNT) }
      this.groups.push(g)
      this.groups.sort((a, b) => a.span - b.span)
    }
    const list = g.lengths[tag] ?? (g.lengths[tag] = [])
    if (!list.includes(length)) { list.push(length); list.sort((a, b) => a - b) }
    if (!this.lengths.includes(length)) { this.lengths.push(length); this.lengths.sort((a, b) => a - b) }
  }

  get empty(): boolean {
    return this.groups.length === 0
  }
}

/** The rolling hash of every prefix of `buf`: `out[i]` is the hash of `buf[0, i)`. */
export function prefixHashes(buf: Uint8Array, base: number): Int32Array {
  const out = new Int32Array(buf.length + 1)
  let h = 0
  for (let i = 0; i < buf.length; i++) { h = (Math.imul(h, base) + buf[i]!) | 0; out[i + 1] = h }
  return out
}

/** The tag of `[from, from + span)` of the bytes `prefix` was made over. */
export function tagAt(prefix: Int32Array, from: number, g: TagGroup): number {
  return ((prefix[from + g.span]! - Math.imul(prefix[from]!, g.power)) | 0) >>> TAG_SHIFT
}
