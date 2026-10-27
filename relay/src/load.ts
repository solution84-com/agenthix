/**
 * The relay's only state beside its lines: how many streams each person has open, how many are open in all, and
 * the bytes carried since it started — for the per-person cap and the report to hq. Nothing is kept per file.
 */
import { RELAY_STREAMS_PER_PERSON } from '@agenthix/core'

export class Load {
  readonly startedAt = new Date()
  /** `null`: everyone opening a picture shown before sign-in, counted together. */
  private readonly perPerson = new Map<string | null, number>()
  private open = 0
  private carried = 0

  constructor(private readonly perPersonCap: number = RELAY_STREAMS_PER_PERSON) {}

  /** Takes a stream for a person, or false at the cap. The returned release is safe to call more than once. */
  take(person: string | null): (() => void) | false {
    const held = this.perPerson.get(person) ?? 0
    if (held >= this.perPersonCap) return false
    this.perPerson.set(person, held + 1)
    this.open++
    let released = false
    return () => {
      if (released) return
      released = true
      this.open--
      const left = (this.perPerson.get(person) ?? 1) - 1
      if (left > 0) this.perPerson.set(person, left)
      else this.perPerson.delete(person)
    }
  }

  carry(bytes: number): void {
    this.carried += bytes
  }

  get openStreams(): number {
    return this.open
  }

  get bytesCarried(): number {
    return this.carried
  }
}
