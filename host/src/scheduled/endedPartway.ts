import { Refusal } from '../owner/results'

/** A failure after which the machine is not as it was: recorded in its own words, never as put back. */
export class EndedPartway extends Refusal {
  constructor(message: string) {
    super('failed', message)
  }
}
